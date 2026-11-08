import { Router } from 'express';
import { orderController } from '../controllers/order.controller';
import { protect } from '@shared/middlewares/auth.middleware';

const router = Router();

// Standard Razorpay Checkout routes
router.post('/create-order', orderController.createGenericOrder.bind(orderController));
router.post('/verify-payment', orderController.verifyGenericPayment.bind(orderController));

// Protected: open a Razorpay Checkout session for an order the shopper owns.
router.post(
  '/razorpay/order/:id',
  protect,
  orderController.createRazorpayOrder.bind(orderController)
);

// Protected: confirm the handles Razorpay Checkout returned to the browser.
router.post(
  '/razorpay/verify',
  protect,
  orderController.verifyRazorpayPayment.bind(orderController)
);

// Public: Razorpay server-to-server webhook. Authorised by the X-Razorpay-Signature
// HMAC over the raw request body (see the express.raw() mount in app.ts), which is
// why it must not sit behind `protect`.
router.post('/webhook', orderController.webhook.bind(orderController));

export default router;
