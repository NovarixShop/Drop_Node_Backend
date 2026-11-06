/**
 * Razorpay credentials and REST helper.
 *
 * Talks to the Razorpay REST API over `fetch` rather than the `razorpay` npm package:
 * the three calls we need (create order, fetch payment, verify signature) are a thin
 * wrapper over HTTP + HMAC, so this avoids adding a dependency to every service image.
 *
 * Required env (see .env.example):
 *   RAZORPAY_KEY_ID          rzp_test_… / rzp_live_…  (the key id is public; the browser gets it)
 *   RAZORPAY_KEY_SECRET      server-only. Signs and verifies payment signatures.
 *   RAZORPAY_WEBHOOK_SECRET  server-only. Set to the same value in the Razorpay dashboard webhook.
 */
import { logger } from '@shared/utils/logger';

const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';

export const razorpayConfig = {
  keyId: process.env.RAZORPAY_KEY_ID || '',
  keySecret: process.env.RAZORPAY_KEY_SECRET || '',
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  /** Razorpay settles in the account currency; INR unless the account is configured otherwise. */
  currency: process.env.RAZORPAY_CURRENCY || 'INR',
};

export const isRazorpayConfigured = (): boolean =>
  Boolean(razorpayConfig.keyId && razorpayConfig.keySecret);

export const isRazorpayWebhookConfigured = (): boolean => Boolean(razorpayConfig.webhookSecret);

/**
 * Warn loudly at boot instead of failing only when a shopper reaches checkout.
 * Card checkout returns 503 until the keys are present; COD keeps working.
 */
export const reportRazorpayConfig = (): void => {
  if (!isRazorpayConfigured()) {
    logger.warn(
      '⚠️  Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing). ' +
        'Card checkout will return 503; Cash on Delivery still works.'
    );
    return;
  }
  const mode = razorpayConfig.keyId.startsWith('rzp_live') ? 'LIVE' : 'TEST';
  logger.info(`💳 Razorpay configured in ${mode} mode (key ${razorpayConfig.keyId.slice(0, 12)}…)`);
  if (!isRazorpayWebhookConfigured()) {
    logger.warn(
      '⚠️  RAZORPAY_WEBHOOK_SECRET is not set. Payments still settle through the browser ' +
        'verify call, but a shopper who closes the tab mid-payment will not be reconciled.'
    );
  }
};

/** Basic-auth header Razorpay expects: key_id as the user, key_secret as the password. */
const authHeader = (): string =>
  'Basic ' + Buffer.from(`${razorpayConfig.keyId}:${razorpayConfig.keySecret}`).toString('base64');

export interface RazorpayError extends Error {
  statusCode?: number;
  razorpayCode?: string;
}

/** Minimal authenticated JSON call against the Razorpay REST API. */
export const razorpayRequest = async <T>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {}
): Promise<T> => {
  const { method = 'GET', body } = init;

  // Never let a hung payment gateway hold a checkout request open indefinitely.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(`${RAZORPAY_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: authHeader(),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    const payload = text ? JSON.parse(text) : {};

    if (!res.ok) {
      const description = payload?.error?.description || `Razorpay request failed (${res.status})`;
      logger.error(`❌ [Razorpay] ${method} ${path} -> ${res.status}: ${description}`);
      const err = new Error(description) as RazorpayError;
      err.statusCode = res.status;
      err.razorpayCode = payload?.error?.code;
      throw err;
    }

    return payload as T;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      logger.error(`❌ [Razorpay] ${method} ${path} timed out after 15s`);
      throw new Error('The payment gateway did not respond in time. Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
};
