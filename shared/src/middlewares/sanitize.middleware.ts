import { Request, Response, NextFunction } from 'express';

// NoSQL-injection guard: strips object keys that MongoDB would treat as operators ("$gt", "$where", ...)
// or as nested paths ("a.b") from the body, query string and route params.
// Example blocked attack: GET /api/products?category[$ne]=x  or  POST /login {"email": {"$gt": ""}}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !Buffer.isBuffer(value);

const clean = (value: unknown, depth = 0): unknown => {
  if (depth > 20) return undefined;

  if (Array.isArray(value)) {
    return value.map((item) => clean(item, depth + 1));
  }

  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor' || key === 'prototype') {
        delete value[key];
      } else {
        value[key] = clean(value[key], depth + 1);
      }
    }
  }

  return value;
};

export const sanitizeRequest = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.body) clean(req.body);
  if (req.query) {
    clean(req.query);
    // No endpoint takes nested objects in the query string (?a[b]=c); drop them instead of letting
    // services call string methods on an object
    for (const key of Object.keys(req.query)) {
      if (isPlainObject(req.query[key])) delete req.query[key];
    }
  }
  if (req.params) clean(req.params);
  next();
};

export default sanitizeRequest;
