import { Request, Response, NextFunction } from 'express';
import { orderService } from '../services/order.service';
import { paymentService } from '../services/payment.service';
import { trackingService } from '../services/tracking.service';
import { ForbiddenError } from '@shared/errors/app-error';
import { UserRole, PaymentMethod, OrderStatus } from '@shared/constants';
import { getUserIdFromOrder } from '../models/order.model';
import { z } from 'zod';

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

// Razorpay Checkout collects the card itself, so no PAN/CVC ever reaches this service.
// These are the three opaque handles the widget returns to the browser.
const verifyPaymentSchema = z.object({
  orderId: z.string().min(1, 'orderId is required'),
  razorpay_order_id: z.string().min(1, 'razorpay_order_id is required'),
  razorpay_payment_id: z.string().min(1, 'razorpay_payment_id is required'),
  razorpay_signature: z.string().min(1, 'razorpay_signature is required'),
});

const createOrderSchema = z.object({
  amount: z.number().min(100, 'Minimum amount is 100 paise'),
  currency: z.string().optional(),
  receipt: z.string().optional(),
});

const genericVerifyPaymentSchema = z.object({
  order_id: z.string().optional(),
  razorpay_order_id: z.string().optional(),
  payment_id: z.string().optional(),
  razorpay_payment_id: z.string().optional(),
  signature: z.string().optional(),
  razorpay_signature: z.string().optional(),
}).refine(
  (data) =>
    Boolean(data.order_id || data.razorpay_order_id) &&
    Boolean(data.payment_id || data.razorpay_payment_id) &&
    Boolean(data.signature || data.razorpay_signature),
  { message: 'Missing order_id, payment_id, or signature' }
);

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
        getUserIdFromOrder(order) !== userId &&
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
  // Step 1: open a Razorpay order for an existing order, so the browser can launch Checkout.
  public async createRazorpayOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = req.params.id;

      // Only the order owner may pay for it.
      const order = await orderService.getOrderDetails(orderId);
      if (getUserIdFromOrder(order) !== req.authUser!.id) {
        throw new ForbiddenError('You do not have permission to pay for this order.');
      }

      const session = await paymentService.createPaymentOrder(orderId);

      res.status(201).json({
        status: 'success',
        message: 'Payment session created.',
        data: session,
      });
    } catch (error) {
      next(error);
    }
  }

  // Step 2: confirm what Checkout handed back, then release the order.
  public async verifyRazorpayPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = verifyPaymentSchema.parse(req.body);

      const order = await orderService.getOrderDetails(body.orderId);
      if (getUserIdFromOrder(order) !== req.authUser!.id) {
        throw new ForbiddenError('You do not have permission to pay for this order.');
      }

      const result = await paymentService.verifyPayment({
        orderId: body.orderId,
        razorpayOrderId: body.razorpay_order_id,
        razorpayPaymentId: body.razorpay_payment_id,
        signature: body.razorpay_signature,
      });

      res.status(200).json({
        status: 'success',
        message: 'Payment verified. Your order is confirmed.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Generic create-order endpoint for Razorpay Standard Checkout
  public async createGenericOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = createOrderSchema.parse(req.body);
      const result = await paymentService.createRawOrder(body);
      res.status(200).json({
        success: true,
        order_id: result.order_id,
        amount: result.amount,
        currency: result.currency,
        key_id: result.key_id,
      });
    } catch (error) {
      next(error);
    }
  }

  // Generic verify-payment endpoint for Razorpay Standard Checkout
  public async verifyGenericPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = genericVerifyPaymentSchema.parse(req.body);
      const order_id = (body.order_id || body.razorpay_order_id)!;
      const payment_id = (body.payment_id || body.razorpay_payment_id)!;
      const signature = (body.signature || body.razorpay_signature)!;

      await paymentService.verifyRawPayment({ order_id, payment_id, signature });

      res.status(200).json({
        success: true,
        message: 'Payment verified successfully',
        payment_id,
        order_id,
      });
    } catch (error) {
      next(error);
    }
  }

  // Razorpay webhook. Publicly routable, so the signature over the RAW body is the only
  // thing that authorises it (see express.raw() for this path in app.ts).
  public async webhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const signature = req.headers['x-razorpay-signature'];
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));

      await paymentService.handleWebhook(
        rawBody,
        typeof signature === 'string' ? signature : undefined
      );

      // Always 200 once accepted, otherwise Razorpay retries a payload we have already processed.
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
        getUserIdFromOrder(order) !== userId &&
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
