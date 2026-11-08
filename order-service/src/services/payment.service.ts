import crypto from 'crypto';
import { orderRepository } from '../repositories/order.repository';
import { getUserIdFromOrder } from '../models/order.model';
import { PaymentStatus, OrderStatus, PaymentMethod } from '@shared/constants';
import { AppError, BadRequestError, NotFoundError } from '@shared/errors/app-error';
import { logger } from '@shared/utils/logger';
import { cartClient, catalogClient } from '../utils/clients';
import { redisCache } from '../config/redis.config';
import {
  razorpayConfig,
  razorpayRequest,
  isRazorpayConfigured,
  isRazorpayWebhookConfigured,
} from '../config/razorpay.config';

/** Razorpay amounts are in the currency's smallest unit (paise for INR). */
const toMinorUnits = (amount: number): number => Math.round(amount * 100);

interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

interface RazorpayPayment {
  id: string;
  order_id: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  amount: number;
  currency: string;
  method?: string;
  card?: { network?: string; last4?: string };
  bank?: string;
  wallet?: string;
  vpa?: string;
  email?: string;
  contact?: string;
  error_description?: string;
}

/**
 * order.paymentDetails is declared as `Map` in the schema, so mongoose hands back a Map
 * instance, not a plain object. Spreading a Map with `...` yields `{}` and reading
 * `details.someKey` yields undefined, so both must go through here.
 */
const readPaymentDetails = (details: unknown): Record<string, unknown> => {
  if (!details) return {};
  if (details instanceof Map) return Object.fromEntries(details as Map<string, unknown>);
  return { ...(details as Record<string, unknown>) };
};

/** Equal-length, constant-time comparison of two hex signatures. */
const signaturesMatch = (expected: string, provided: string): boolean => {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  // timingSafeEqual throws on a length mismatch, which would itself leak length info.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export class PaymentService {
  /**
   * Step 1 of checkout: create the Razorpay order the browser's Checkout widget opens.
   *
   * Returns only what the browser legitimately needs. The amount comes from the order we
   * already stored, never from the client, so a tampered page cannot pay less than the total.
   */
  public async createPaymentOrder(orderId: string): Promise<{
    keyId: string;
    razorpayOrderId: string;
    amount: number;
    currency: string;
    orderId: string;
  }> {
    if (!isRazorpayConfigured()) {
      throw new AppError(
        'Online payment is temporarily unavailable. Please choose Cash on Delivery.',
        503
      );
    }

    const order = await orderRepository.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');

    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestError('Order is already paid');
    }
    if (order.orderStatus === OrderStatus.CANCELLED) {
      throw new BadRequestError('Cannot pay for a cancelled order');
    }
    if (order.paymentMethod === PaymentMethod.COD) {
      throw new BadRequestError('This order is set to Cash on Delivery');
    }

    const amount = toMinorUnits(order.totals.grandTotal);
    if (amount < 100) {
      // Razorpay rejects anything under 1.00 in the account currency.
      throw new BadRequestError('Order total is below the minimum amount this gateway accepts');
    }

    const razorpayOrder = await razorpayRequest<RazorpayOrder>('/orders', {
      method: 'POST',
      body: {
        amount,
        currency: razorpayConfig.currency,
        // Our own id, so a Razorpay dashboard entry can be traced back to an order.
        receipt: order.id,
        notes: { orderId: order.id },
      },
    });

    order.paymentDetails = {
      ...readPaymentDetails(order.paymentDetails),
      provider: 'razorpay',
      razorpayOrderId: razorpayOrder.id,
      amountMinor: amount,
      currency: razorpayOrder.currency,
    } as never;
    await order.save();

    logger.info(
      `💳 [Razorpay] Created gateway order ${razorpayOrder.id} for order ${order.id} (${amount} ${razorpayOrder.currency} minor units)`
    );

    return {
      keyId: razorpayConfig.keyId,
      razorpayOrderId: razorpayOrder.id,
      amount,
      currency: razorpayOrder.currency,
      orderId: order.id,
    };
  }

  /**
   * Step 2: the browser hands back what Checkout gave it. The signature is an HMAC of
   * "<razorpay_order_id>|<razorpay_payment_id>" keyed with the secret, which only our
   * server and Razorpay know — so a client cannot forge a successful payment.
   *
   * The signature alone proves authenticity; we additionally fetch the payment to confirm
   * it is actually captured for the full amount before releasing the order.
   */
  public async verifyPayment(input: {
    orderId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    signature: string;
  }): Promise<{ paid: boolean; transactionId: string }> {
    if (!isRazorpayConfigured()) {
      throw new AppError('Online payment is temporarily unavailable.', 503);
    }

    const { orderId, razorpayOrderId, razorpayPaymentId, signature } = input;

    const order = await orderRepository.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');

    const stored = readPaymentDetails(order.paymentDetails);
    if (stored.razorpayOrderId && stored.razorpayOrderId !== razorpayOrderId) {
      // The payment belongs to a different gateway order than the one we created here.
      throw new BadRequestError('This payment does not belong to the order being paid');
    }

    const expected = crypto
      .createHmac('sha256', razorpayConfig.keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (!signaturesMatch(expected, signature)) {
      logger.warn(
        `🚨 [Razorpay] Signature mismatch verifying payment ${razorpayPaymentId} for order ${orderId}`
      );
      await this.markFailed(order, 'Payment signature verification failed.');
      throw new BadRequestError('We could not verify this payment. It has not been charged.');
    }

    const payment = await razorpayRequest<RazorpayPayment>(`/payments/${razorpayPaymentId}`);

    if (payment.order_id !== razorpayOrderId) {
      throw new BadRequestError('Payment does not match the gateway order');
    }
    if (payment.amount < toMinorUnits(order.totals.grandTotal)) {
      logger.warn(
        `🚨 [Razorpay] Underpayment for order ${orderId}: paid ${payment.amount}, expected ${toMinorUnits(order.totals.grandTotal)}`
      );
      throw new BadRequestError('The amount paid does not cover the order total.');
    }
    if (payment.status !== 'captured' && payment.status !== 'authorized') {
      throw new BadRequestError(
        payment.error_description || 'The payment was not completed. Please try again.'
      );
    }

    await this.markPaid(order, payment);
    return { paid: true, transactionId: payment.id };
  }

  /**
   * Out-of-band settlement. Razorpay retries this, and it is the only path that still
   * completes an order when the shopper closes the tab after paying, so it must be
   * idempotent — markPaid() returns early if the order is already paid.
   */
  public async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<void> {
    if (!isRazorpayWebhookConfigured()) {
      throw new AppError('Webhooks are not configured on this server.', 503);
    }
    if (!signature) {
      throw new BadRequestError('Missing X-Razorpay-Signature header');
    }

    const expected = crypto
      .createHmac('sha256', razorpayConfig.webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (!signaturesMatch(expected, signature)) {
      logger.warn('🚨 [Razorpay] Rejected a webhook with an invalid signature');
      // Deliberately an auth failure, not a 400: the body may be perfectly well-formed.
      throw new AppError('Invalid webhook signature', 401);
    }

    const event = JSON.parse(rawBody.toString('utf8')) as {
      event: string;
      payload?: { payment?: { entity?: RazorpayPayment } };
    };
    const payment = event.payload?.payment?.entity;
    logger.info(`🔌 [Razorpay] Webhook received: ${event.event}`);

    if (!payment) return;

    // The payment entity carries its own notes only if Checkout set them, so the
    // reliable link back to our order is the gateway order id stored at checkout.
    const order = payment.order_id
      ? await orderRepository.findByRazorpayOrderId(payment.order_id)
      : null;

    if (!order) {
      logger.warn(
        `🔌 [Razorpay] Webhook ${event.event}: no local order matches gateway order ` +
          `${payment.order_id || '(none)'}; ignoring`
      );
      return;
    }

    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      await this.markPaid(order, payment);
    } else if (event.event === 'payment.failed') {
      await this.markFailed(
        order,
        `Payment failed at the gateway${payment.error_description ? `: ${payment.error_description}` : '.'}`
      );
    }
  }

  /** Idempotent: safe to call from both the browser verify call and the webhook. */
  private async markPaid(
    order: Awaited<ReturnType<typeof orderRepository.findById>> & object,
    payment: RazorpayPayment
  ): Promise<void> {
    if (order.paymentStatus === PaymentStatus.PAID) {
      logger.info(`🔁 [Razorpay] Order ${order.id} is already paid; skipping`);
      return;
    }
    if (order.orderStatus === OrderStatus.CANCELLED) {
      logger.warn(`⚠️  [Razorpay] Order ${order.id} was cancelled before payment settled`);
      return;
    }

    order.paymentStatus = PaymentStatus.PAID;
    order.orderStatus = OrderStatus.PROCESSING;
    order.paymentDetails = {
      ...readPaymentDetails(order.paymentDetails),
      provider: 'razorpay',
      transactionId: payment.id,
      razorpayOrderId: payment.order_id,
      method: payment.method || 'unknown',
      cardBrand: payment.card?.network,
      cardLast4: payment.card?.last4,
      bank: payment.bank,
      wallet: payment.wallet,
      vpa: payment.vpa,
      amountMinor: payment.amount,
      currency: payment.currency,
      paidAt: new Date().toISOString(),
    } as never;

    order.statusHistory.push({
      status: OrderStatus.PROCESSING,
      timestamp: new Date(),
      note: `Payment received via Razorpay (${payment.method || 'online'}). Payment ID: ${payment.id}.`,
    });

    await order.save();
    logger.info(`✅ [Razorpay] Order ${order.id} marked Paid & Processing (payment ${payment.id})`);

    // Clear user's cart in Cart Service
    const orderUserId = getUserIdFromOrder(order);
    try {
      if (orderUserId) {
        await cartClient.clearCart(orderUserId);
      }
    } catch (cartErr) {
      logger.warn(`⚠️ Failed to clear cart for user ${orderUserId} after payment`, cartErr);
    }

    // Publish order.placed event to Redis Pub/Sub for notifications
    try {
      await redisCache.publish('order.placed', {
        orderId: order.id,
        userId: orderUserId,
        grandTotal: order.totals.grandTotal,
        trackingNumber: order.trackingNumber,
        itemsCount: order.items.length,
        timestamp: new Date().toISOString(),
      });
    } catch (redisErr) {
      logger.error('⚠️ Failed to publish order.placed event to Redis Pub/Sub', redisErr);
    }
  }

  private async markFailed(
    order: Awaited<ReturnType<typeof orderRepository.findById>> & object,
    note: string
  ): Promise<void> {
    // Never downgrade an order that already settled (a late failure webhook after capture).
    if (order.paymentStatus === PaymentStatus.PAID) return;

    order.paymentStatus = PaymentStatus.FAILED;
    order.orderStatus = OrderStatus.CANCELLED;

    // Release reserved inventory back to catalog
    const releaseItems = order.items.map((item: any) => ({
      productId: item.product.toString(),
      quantity: item.quantity,
    }));
    try {
      await catalogClient.releaseStock(releaseItems);
    } catch (err) {
      logger.error(`⚠️ Failed to release stock for failed payment order ${order.id}`, err);
    }

    order.statusHistory.push({
      status: OrderStatus.CANCELLED,
      timestamp: new Date(),
      note: `Payment failed: ${note}. Reserved items returned to catalog.`,
    });
    await order.save();
  }

  /**
   * Direct Standard Checkout order creation (accepts amount in paise).
   */
  public async createRawOrder(input: {
    amount: number;
    currency?: string;
    receipt?: string;
  }): Promise<{
    order_id: string;
    amount: number;
    currency: string;
    key_id: string;
  }> {
    if (!isRazorpayConfigured()) {
      throw new AppError('Razorpay is not configured on the server.', 503);
    }

    if (input.amount < 100) {
      throw new BadRequestError('Minimum amount is 100 paise');
    }

    const razorpayOrder = await razorpayRequest<RazorpayOrder>('/orders', {
      method: 'POST',
      body: {
        amount: Math.round(input.amount),
        currency: input.currency || razorpayConfig.currency || 'INR',
        receipt: input.receipt || `rcpt_${Date.now()}`,
      },
    });

    return {
      order_id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key_id: razorpayConfig.keyId,
    };
  }

  /**
   * Direct signature verification for standard checkout.
   */
  public async verifyRawPayment(input: {
    order_id: string;
    payment_id: string;
    signature: string;
  }): Promise<{ verified: boolean }> {
    if (!isRazorpayConfigured()) {
      throw new AppError('Razorpay is not configured on the server.', 503);
    }

    const { order_id, payment_id, signature } = input;
    if (!order_id || !payment_id || !signature) {
      throw new BadRequestError('Missing order_id, payment_id, or signature');
    }

    const expected = crypto
      .createHmac('sha256', razorpayConfig.keySecret)
      .update(`${order_id}|${payment_id}`)
      .digest('hex');

    const matches = signaturesMatch(expected, signature);
    if (!matches) {
      logger.warn(`🚨 [Razorpay] Standard checkout signature mismatch for payment ${payment_id}`);
      throw new BadRequestError('Invalid payment signature');
    }

    return { verified: true };
  }
}

export const paymentService = new PaymentService();
export default paymentService;
