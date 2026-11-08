import { orderRepository, OrderRepository } from '../repositories/order.repository';
import { cartClient, catalogClient } from '../utils/clients';
import { IOrder } from '../models/order.model';
import { BadRequestError, NotFoundError } from '@shared/errors/app-error';
import { OrderStatus, PaymentStatus, PaymentMethod } from '@shared/constants';
import { v4 as uuidv4 } from 'uuid';
import { redisCache } from '../config/redis.config';
import { logger } from '@shared/utils/logger';

export class OrderService {
  private orderRepo: OrderRepository;

  constructor(orderRepo = orderRepository) {
    this.orderRepo = orderRepo;
  }

  // Checkout: Place a new order using a Saga Orchestration pattern with REST calls and compensators!
  public async checkout(
    userId: string,
    checkoutData: {
      paymentMethod: PaymentMethod;
      shippingAddress: {
        street: string;
        city: string;
        state: string;
        postalCode: string;
        country: string;
      };
      billingAddress?: {
        street: string;
        city: string;
        state: string;
        postalCode: string;
        country: string;
      };
    }
  ): Promise<IOrder> {
    const { paymentMethod, shippingAddress, billingAddress } = checkoutData;

    if (!shippingAddress) {
      throw new BadRequestError('Shipping address is required');
    }

    const finalBillingAddress = billingAddress || shippingAddress;

    // 1. Get user's cart from Cart Service over internal REST
    const cart = await cartClient.getCart(userId);
    if (!cart || cart.items.length === 0) {
      throw new BadRequestError('Cannot checkout an empty cart');
    }

    if (paymentMethod === PaymentMethod.COD) {
      const codForbidden = cart.items.some((item: any) => item.product?.isCodAvailable === false);
      if (codForbidden) {
        throw new BadRequestError('Cash on Delivery is not available for one or more items in your cart. Please select online payment.');
      }
    }

    // 2. Reserve stock in Catalog Service (Sync REST API call)
    const reserveItems = cart.items.map((item: any) => ({
      productId: item.product._id.toString(),
      quantity: item.quantity,
    }));

    // This will throw an error if stock is insufficient or product is inactive
    await catalogClient.reserveStock(reserveItems);

    // 3. Create Order Document in local Database
    const orderItems = cart.items.map((item: any) => ({
      product: item.product._id,
      name: item.product.name,
      price: item.product.price,
      quantity: item.quantity,
    }));

    const trackingNumber = 'TRK-' + uuidv4().slice(-12).toUpperCase();
    
    let order: IOrder;
    try {
      order = await this.orderRepo.create({
        user: userId as any,
        items: orderItems,
        shippingAddress,
        billingAddress: finalBillingAddress,
        totals: {
          subtotal: cart.totals.subtotal,
          discount: cart.totals.discount,
          tax: cart.totals.tax,
          shipping: cart.totals.shipping,
          grandTotal: cart.totals.grandTotal,
        },
        paymentMethod,
        paymentStatus: PaymentStatus.PENDING,
        orderStatus: OrderStatus.PENDING,
        trackingNumber,
        statusHistory: [
          {
            status: OrderStatus.PENDING,
            timestamp: new Date(),
            note: 'Order checkout completed. Awaiting payment processing.',
          },
        ],
      });
    } catch (dbError: any) {
      // SAGA COMPENSATING ACTION: If local database order creation fails, release reserved stock!
      logger.error('❌ Database Order creation failed. Releasing stock in Catalog Service as compensating action.', dbError);
      await catalogClient.releaseStock(reserveItems);
      throw dbError;
    }

    // 4. For Cash on Delivery, approve order, clear cart, and broadcast immediately.
    // For online payments (Razorpay), this is handled in markPaid once payment succeeds.
    if (paymentMethod === PaymentMethod.COD) {
      try {
        await cartClient.clearCart(userId);
      } catch (cartErr) {
        logger.warn(`⚠️ Failed to clear cart for user ${userId} after order placement.`, cartErr);
      }

      try {
        await redisCache.publish('order.placed', {
          orderId: order.id,
          userId: userId,
          grandTotal: order.totals.grandTotal,
          trackingNumber: order.trackingNumber,
          itemsCount: order.items.length,
          timestamp: new Date().toISOString(),
        });
      } catch (redisErr) {
        logger.error('⚠️ Failed to publish order.placed event to Redis Pub/Sub', redisErr);
      }

      const updated = await this.updateOrderStatus(order.id, OrderStatus.PROCESSING, 'Cash on delivery order approved.');
      if (updated) order = updated;
    }

    return order;
  }

  // Cancel order: Release stock back in Catalog Service
  public async cancelOrder(orderId: string, userId: string): Promise<IOrder> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      throw new NotFoundError('Order not found');
    }

    // Verify ownership
    if (order.user.toString() !== userId) {
      throw new BadRequestError('You do not have permission to cancel this order');
    }

    // Only Pending orders can be cancelled
    if (order.orderStatus !== OrderStatus.PENDING) {
      throw new BadRequestError(`Cannot cancel order in "${order.orderStatus}" status.`);
    }

    // Release stock in Catalog Service
    const releaseItems = order.items.map((item: any) => ({
      productId: item.product.toString(),
      quantity: item.quantity,
    }));
    
    try {
      await catalogClient.releaseStock(releaseItems);
    } catch (err) {
      logger.error(`⚠️ Failed to release stock when cancelling order ${orderId}`, err);
    }

    // Update order status
    order.orderStatus = OrderStatus.CANCELLED;
    order.statusHistory.push({
      status: OrderStatus.CANCELLED,
      timestamp: new Date(),
      note: 'Order cancelled by customer. Stock items restored.',
    });

    await order.save();
    return order;
  }

  // Update order status
  public async updateOrderStatus(orderId: string, status: OrderStatus, note?: string): Promise<IOrder> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      throw new NotFoundError('Order not found');
    }

    if (order.orderStatus === OrderStatus.CANCELLED || order.orderStatus === OrderStatus.DELIVERED) {
      throw new BadRequestError(`Cannot update status of a ${order.orderStatus} order.`);
    }

    // Admin cancellations must return reserved stock just like customer cancellations do
    if (status === OrderStatus.CANCELLED) {
      const releaseItems = order.items.map((item: any) => ({
        productId: item.product.toString(),
        quantity: item.quantity,
      }));
      await catalogClient.releaseStock(releaseItems);
    }

    order.orderStatus = status;
    order.statusHistory.push({
      status,
      timestamp: new Date(),
      note: note || `Order status updated to ${status}.`,
    });

    // If order is delivered, automatically mark COD payment as PAID
    if (status === OrderStatus.DELIVERED && order.paymentMethod === PaymentMethod.COD) {
      order.paymentStatus = PaymentStatus.PAID;
    }

    await order.save();
    return order;
  }

  // Get order details
  public async getOrderDetails(orderId: string): Promise<IOrder> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      throw new NotFoundError('Order not found');
    }
    return order;
  }

  // Get user order history
  public async getUserOrders(
    userId: string,
    query: { page?: string; limit?: string }
  ): Promise<{ orders: IOrder[]; total: number; page: number; pages: number }> {
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '10', 10);
    const skip = (page - 1) * limit;

    const { orders, total } = await this.orderRepo.findAndCount({ user: userId }, skip, limit);

    return {
      orders,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  // Admin: Get all orders
  public async getAllOrders(
    query: { page?: string; limit?: string; status?: string }
  ): Promise<{ orders: IOrder[]; total: number; page: number; pages: number }> {
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '10', 10);
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (query.status) {
      filter.orderStatus = query.status;
    }

    const { orders, total } = await this.orderRepo.findAndCount(filter, skip, limit);

    return {
      orders,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }
}

export const orderService = new OrderService();
export default orderService;
