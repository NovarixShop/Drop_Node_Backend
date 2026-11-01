import { Request, Response, NextFunction } from 'express';
import { orderService } from '../services/order.service';
import { paymentService } from '../services/payment.service';
import { trackingService } from '../services/tracking.service';
import { ForbiddenError, UnauthorizedError } from '@shared/errors/app-error';
import { UserRole, PaymentMethod, OrderStatus } from '@shared/constants';
import { z } from 'zod';
import crypto from 'crypto';

const addressSchema = z.object({
  street: z.string().min(1, 'Street is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  postalCode: z.string().min(1, 'Postal code is required'),
  country: z.string().min(1, 'Country is required'),
});

const checkoutSchema = z.object({
  paymentMethod: z.nativeEnum(PaymentMethod),
  shippingAddress: addressSchema,
  billingAddress: addressSchema.optional(),
});

const chargeSchema = z.object({
  cardNumber: z.string().regex(/^\d{16}$/, 'Card number must be exactly 16 digits'),
  expMonth: z.string().regex(/^(0[1-9]|1[0-2])$/, 'Expiration month must be MM format (01-12)'),
  expYear: z.string().regex(/^\d{4}$/, 'Expiration year must be YYYY format'),
  cvc: z.string().regex(/^\d{3,4}$/, 'CVC must be 3 or 4 digits'),
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  note: z.string().optional(),
});

export class OrderController {
  // Checkout cart (Create order)
  public async checkout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.authUser!.id;
      const validatedBody = checkoutSchema.parse(req.body);
      
      const order = await orderService.checkout(userId, validatedBody);

      res.status(201).json({
        status: 'success',
        message: 'Order placed successfully.',
        data: { order },
      });
    } catch (error) {
      next(error);
    }
  }

  // Cancel order (Pending orders only)
  public async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.authUser!.id;
      const orderId = req.params.id;
      
      const order = await orderService.cancelOrder(orderId, userId);

      res.status(200).json({
        status: 'success',
        message: 'Order cancelled successfully.',
        data: { order },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get single order details
  public async getDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.authUser!.id;
      const userRole = req.authUser!.role;
      const orderId = req.params.id;

      const order = await orderService.getOrderDetails(orderId);

      // Authorization check: User must own the order, or be an Admin/Vendor
      if (
        order.user.toString() !== userId &&
        userRole !== UserRole.ADMIN &&
        userRole !== UserRole.VENDOR
      ) {
        throw new ForbiddenError('You do not have permission to view this order.');
      }

      res.status(200).json({
        status: 'success',
        data: { order },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get order history for customer
  public async getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.authUser!.id;
      const result = await orderService.getUserOrders(userId, req.query);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Charge order payment (Simulate Stripe)
  public async charge(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = req.params.id;
      const validatedBody = chargeSchema.parse(req.body);

      // Only the order owner may pay for it (otherwise anyone could mark another user's order as failed)
      const order = await orderService.getOrderDetails(orderId);
      if (order.user.toString() !== req.authUser!.id) {
        throw new ForbiddenError('You do not have permission to pay for this order.');
      }

      const result = await paymentService.chargeCard(orderId, validatedBody);

      if (result.status === 'success') {
        res.status(200).json({
          status: 'success',
          message: 'Payment details captured. Awaiting settlement.',
          data: result,
        });
      } else {
        res.status(402).json({
          status: 'error',
          message: 'Payment failed: Card was declined.',
          data: result,
        });
      }
    } catch (error) {
      next(error);
    }
  }

  // Payment Webhook (Stripe mock)
  public async webhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // The webhook is publicly routable, so require the shared secret; without it anyone could mark orders as paid
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      const provided = req.headers['x-webhook-secret'];
      if (
        !secret ||
        typeof provided !== 'string' ||
        provided.length !== secret.length ||
        !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret))
      ) {
        throw new UnauthorizedError('Invalid webhook signature');
      }

      await paymentService.processPaymentWebhook(req.body);
      res.status(200).json({ received: true });
    } catch (error) {
      next(error);
    }
  }

  // Get order shipment tracking checkpoints
  public async getTracking(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.authUser!.id;
      const userRole = req.authUser!.role;
      const orderId = req.params.id;

      const order = await orderService.getOrderDetails(orderId);

      // Authorization check: User must own the order or be Admin/Vendor
      if (
        order.user.toString() !== userId &&
        userRole !== UserRole.ADMIN &&
        userRole !== UserRole.VENDOR
      ) {
        throw new ForbiddenError('You do not have permission to view tracking details for this order.');
      }

      const tracking = await trackingService.getTrackingDetails(orderId);

      res.status(200).json({
        status: 'success',
        data: { tracking },
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: List all orders
  public async adminGetAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await orderService.getAllOrders(req.query);
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Update order status
  public async adminUpdateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = req.params.id;
      const { status, note } = updateStatusSchema.parse(req.body);

      const order = await orderService.updateOrderStatus(orderId, status, note);

      res.status(200).json({
        status: 'success',
        message: `Order status updated to "${status}" successfully.`,
        data: { order },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const orderController = new OrderController();
export default orderController;
