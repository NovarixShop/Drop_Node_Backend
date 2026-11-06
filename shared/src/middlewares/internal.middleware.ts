import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Service-to-service authentication for /api/internal/* routes.
// The gateway already blocks /api/internal/* from the internet; this is a second layer so that an SSRF bug
// or an accidentally published service port can't be used to reserve stock, read carts, etc.

export const INTERNAL_KEY_HEADER = 'x-internal-key';

const safeEqual = (a: string, b: string): boolean => {
  const bufA = crypto.createHash('sha256').update(a).digest();
  const bufB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(bufA, bufB);
};

/** Headers every internal fetch() must send */
export const internalHeaders = (extra: Record<string, string> = {}): Record<string, string> => {
  const headers: Record<string, string> = { ...extra };
  if (process.env.INTERNAL_API_KEY) {
    headers[INTERNAL_KEY_HEADER] = process.env.INTERNAL_API_KEY;
  }
  return headers;
};

export const requireInternalKey = (req: Request, res: Response, next: NextFunction): void => {
  const expected = process.env.INTERNAL_API_KEY;

  if (!expected) {
    // Development convenience only; startup checks refuse to boot production without the key
    if (process.env.NODE_ENV === 'production') {
      res.status(503).json({ status: 'error', message: 'Internal API key is not configured.' });
      return;
    }
    next();
    return;
  }

  const provided = req.header(INTERNAL_KEY_HEADER);
  if (!provided || !safeEqual(provided, expected)) {
    res.status(403).json({ status: 'error', message: 'Access denied.' });
    return;
  }

  next();
};

export default requireInternalKey;
