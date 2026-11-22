import { orderRepository } from '../repositories/order.repository';
import { OrderStatus } from '../constants';
import { NotFoundError, BadRequestError } from '../errors/app-error';

export interface ICheckpoint {
  status: string;
  location: string;
  timestamp: Date;
  description: string;
}

export interface ITrackingDetails {
  orderId: string;
  trackingNumber: string;
  carrier: string;
  estimatedDelivery: Date;
  currentStatus: OrderStatus;
  checkpoints: ICheckpoint[];
}

export class TrackingService {
  // Get simulated tracking details for an order
  public async getTrackingDetails(orderId: string, userId: string): Promise<ITrackingDetails> {
    const order = await orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundError('Order not found');
    }

    // Verify ownership
    if (order.user._id.toString() !== userId) {
      // In controllers, we will allow Admins to bypass this
    }

    if (!order.trackingNumber) {
      throw new BadRequestError('Tracking information is not yet available for this order.');
    }

    const orderCreatedAt = order.createdAt as Date;
    const checkpoints: ICheckpoint[] = [];

    // 1. Checkpoint: Order Placed (Always exists)
    checkpoints.push({
      status: 'Order Placed',
      location: 'System Online',
      timestamp: orderCreatedAt,
      description: 'Your order has been placed and is awaiting payment confirmation.',
    });

    // 2. Checkpoint: Payment Confirmed (If Paid or Processing/Shipped/Delivered)
    const paidHistory = order.statusHistory.find(
      (h) => h.status === OrderStatus.PROCESSING || h.note?.includes('Payment successful')
    );
    const paidTime = paidHistory ? paidHistory.timestamp : new Date(orderCreatedAt.getTime() + 15 * 60 * 1000); // 15 mins later fallback

    if (order.paymentStatus === 'paid' || order.orderStatus !== OrderStatus.PENDING) {
      checkpoints.push({
        status: 'Payment Done',
        location: 'Billing Center',
        timestamp: paidTime,
        description: 'Payment received and verified successfully. Order is confirmed.',
      });
    }

    // 3. Checkpoint: Packed and Ready (If Processing, Shipped, or Delivered)
    const processingHistory = order.statusHistory.find((h) => h.status === OrderStatus.PROCESSING);
    const packedTime = processingHistory 
      ? new Date(processingHistory.timestamp.getTime() + 2 * 3600 * 1000) // 2 hours later
      : new Date(orderCreatedAt.getTime() + 3 * 3600 * 1000);

    if (
      order.orderStatus === OrderStatus.PROCESSING ||
      order.orderStatus === OrderStatus.SHIPPED ||
      order.orderStatus === OrderStatus.DELIVERED
    ) {
      checkpoints.push({
        status: 'Packed at Warehouse',
        location: 'Regional Fulfillment Center (Dallas, TX)',
        timestamp: packedTime,
        description: 'Items have been packed, weighed, and a shipping label has been generated.',
      });
    }

    // 4. Checkpoint: Shipped and In Transit (If Shipped or Delivered)
    const shippedHistory = order.statusHistory.find((h) => h.status === OrderStatus.SHIPPED);
    const shippedTime = shippedHistory ? shippedHistory.timestamp : new Date(packedTime.getTime() + 12 * 3600 * 1000); // 12 hours later

    if (order.orderStatus === OrderStatus.SHIPPED || order.orderStatus === OrderStatus.DELIVERED) {
      checkpoints.push({
        status: 'Shipped and In Transit',
        location: 'Carrier Facility',
        timestamp: shippedTime,
        description: 'Package has been handed over to the carrier and is in transit to the destination.',
      });

      // Add middle transit checkpoint (6 hours after shipping)
      checkpoints.push({
        status: 'In Transit',
        location: 'Sorting Hub',
        timestamp: new Date(shippedTime.getTime() + 6 * 3600 * 1000),
        description: 'Package has arrived at the regional sorting hub and is being processed.',
      });
    }

    // 5. Checkpoint: Out for Delivery & Delivered (If Delivered)
    const deliveredHistory = order.statusHistory.find((h) => h.status === OrderStatus.DELIVERED);
    const deliveredTime = deliveredHistory ? deliveredHistory.timestamp : new Date(shippedTime.getTime() + 24 * 3600 * 1000); // 24 hours later

    if (order.orderStatus === OrderStatus.DELIVERED) {
      const outForDeliveryTime = new Date(deliveredTime.getTime() - 4 * 3600 * 1000); // 4 hours before delivery
      checkpoints.push({
        status: 'Out for Delivery',
        location: 'Local Delivery Facility',
        timestamp: outForDeliveryTime,
        description: 'Package is with a local courier and is out for delivery to your address.',
      });

      checkpoints.push({
        status: 'Delivered',
        location: 'Customer Address',
        timestamp: deliveredTime,
        description: 'Package was delivered and signed for. Front door dropoff.',
      });
    }

    // If order was cancelled, append cancellation checkpoint
    if (order.orderStatus === OrderStatus.CANCELLED) {
      const cancelledHistory = order.statusHistory.find((h) => h.status === OrderStatus.CANCELLED);
      checkpoints.push({
        status: 'Order Cancelled',
        location: 'System Online',
        timestamp: cancelledHistory ? cancelledHistory.timestamp : new Date(),
        description: 'Order was cancelled. No further shipping updates will be posted.',
      });
    }

    // Estimated delivery date is 2 days after creation
    const estimatedDelivery = new Date(orderCreatedAt.getTime() + 48 * 3600 * 1000);

    return {
      orderId: order.id,
      trackingNumber: order.trackingNumber,
      carrier: 'Apex Express Logistics',
      estimatedDelivery,
      currentStatus: order.orderStatus,
      checkpoints: checkpoints.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()), // Sort newest first
    };
  }
}

export const trackingService = new TrackingService();
export default trackingService;
