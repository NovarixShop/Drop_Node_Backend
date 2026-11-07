import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import proxy from 'express-http-proxy';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 5000;

// Set TRUST_PROXY (e.g. "1") when the gateway sits behind a reverse proxy so req.ip is the real client IP
if (process.env.TRUST_PROXY) {
  const trustProxy = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isNaN(trustProxy) ? process.env.TRUST_PROXY : trustProxy);
}

// 1. Security Headers
app.use(
  helmet({
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  })
);

// 2. CORS Policies
// CORS_ORIGINS = comma-separated list of the storefront and CMS origins, e.g.
//   https://shop.example.com,https://admin.example.com
// Production refuses to start without it. (The old fallback list contained third-party domains such as
// admin.com, which would have been allowed to make credentialed requests.)
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ [Gateway] CORS_ORIGINS must be set in production (e.g. https://shop.example.com,https://admin.example.com)');
    process.exit(1);
  }
  allowedOrigins.push('http://localhost:3000', 'http://localhost:3001');
}

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// Microservice locations and the shared proxy factory
const AUTH_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:5001';
const CATALOG_URL = process.env.CATALOG_SERVICE_URL || 'http://localhost:5002';
const CART_URL = process.env.CART_SERVICE_URL || 'http://localhost:5003';
const ORDER_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:5004';
const NOTIFICATION_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:5005';
const CONTENT_URL = process.env.CONTENT_SERVICE_URL || 'http://localhost:5006';

const forwardTo = (target: string, prefix: string, options: { limit?: string; crossOriginResource?: boolean } = {}) =>
  proxy(target, {
    limit: options.limit || '1mb',
    proxyReqPathResolver: (req: any) => prefix + req.url,
    // Pass the real client IP so downstream rate limiters don't lump every user under the gateway's IP,
    // plus the public protocol/host so services can build absolute links (e.g. uploaded image URLs)
    proxyReqOptDecorator: (proxyReqOpts: any, srcReq: any) => {
      proxyReqOpts.headers = proxyReqOpts.headers || {};
      proxyReqOpts.headers['x-forwarded-for'] = srcReq.ip;
      proxyReqOpts.headers['x-forwarded-proto'] = srcReq.protocol;
      proxyReqOpts.headers['x-forwarded-host'] = srcReq.get('host');
      // Never forward a client-supplied service-to-service key
      delete proxyReqOpts.headers['x-internal-key'];
      return proxyReqOpts;
    },
    // The gateway owns CORS. These headers are the merged response headers (gateway + service), so drop all
    // CORS headers a service may have sent, then re-apply the gateway's own allow-list decision.
    userResHeaderDecorator: (headers: any, userReq: any) => {
      for (const name of Object.keys(headers)) {
        if (name.toLowerCase().startsWith('access-control-')) delete headers[name];
      }
      const origin = userReq.headers.origin;
      if (origin && allowedOrigins.includes(origin)) {
        headers['access-control-allow-origin'] = origin;
        headers['access-control-allow-credentials'] = 'true';
        headers['vary'] = headers['vary'] ? `${headers['vary']}, Origin` : 'Origin';
      }
      // Files embedded by the storefront/CMS (other origins) need a cross-origin resource policy
      if (options.crossOriginResource) headers['cross-origin-resource-policy'] = 'cross-origin';
      return headers;
    },
    proxyErrorHandler: (err: any, res: any, next: any) => {
      console.error(`❌ [Gateway] Proxy error communicating with ${target}${prefix}:`, err?.message || err);
      if (res.headersSent) {
        return next(err);
      }
      return res.status(502).json({
        status: 'error',
        message: `Service at ${prefix} is temporarily unavailable or restarting. Please try again shortly.`,
        code: err?.code || 'SERVICE_UNAVAILABLE',
      });
    },
  });

// Product images: proxied before the rate limiter, because one product grid loads dozens of images and
// would otherwise exhaust a visitor's API budget. Uploading still requires an admin token downstream.
app.use('/api/uploads', forwardTo(CATALOG_URL, '/api/uploads', { limit: '11mb', crossOriginResource: true }));

// 3. Global Rate Limiting
const limiter = rateLimit({
  max: 1000, // Limit each IP to 1000 requests per 15-minute window for production Next.js apps
  windowMs: 15 * 60 * 1000,
  message: 'Too many requests from this IP, please try again in 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// 4. Request Logging
app.use((req, _res, next) => {
  console.log(`[Gateway] [${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> Routing...`);
  next();
});

// 5. Block Public Access to Internal APIs (Security Best Practice!)
app.all('/api/internal/*', (_req, res) => {
  res.status(403).json({
    status: 'error',
    message: 'Access Denied: Internal routing endpoints are blocked from public access.',
  });
});

// 6. Microservices Routing Proxies
// Auth & User Service Proxy
app.use('/api/auth', forwardTo(AUTH_URL, '/api/auth'));
app.use('/api/users', forwardTo(AUTH_URL, '/api/users'));

// Catalog & Product Service Proxy
app.use('/api/products', forwardTo(CATALOG_URL, '/api/products'));
app.use('/api/categories', forwardTo(CATALOG_URL, '/api/categories'));
app.use('/api/deals', forwardTo(CATALOG_URL, '/api/deals'));
app.use('/api/inventory', forwardTo(CATALOG_URL, '/api/inventory'));

// Cart & Wishlist Service Proxy
app.use('/api/cart', forwardTo(CART_URL, '/api/cart'));
app.use('/api/wishlist', forwardTo(CART_URL, '/api/wishlist'));
app.use('/api/coupons', forwardTo(CART_URL, '/api/coupons'));
app.use('/api/rewards', forwardTo(CART_URL, '/api/rewards'));

// Order & Checkout Service Proxy
app.use('/api/orders', forwardTo(ORDER_URL, '/api/orders'));
app.use('/api/payments', forwardTo(ORDER_URL, '/api/payments'));
app.use('/api/tracking', forwardTo(ORDER_URL, '/api/tracking'));
app.use('/api/admin/analytics', forwardTo(ORDER_URL, '/api/admin/analytics'));

// Notification Service Proxy
app.use('/api/notifications', forwardTo(NOTIFICATION_URL, '/api/notifications'));

// CMS & Blog Service Proxy
app.use('/api/blogs', forwardTo(CONTENT_URL, '/api/blogs'));
app.use('/api/cms', forwardTo(CONTENT_URL, '/api/cms'));

// Unified Swagger Documentation Aggregator placeholder
// (In Phase 7, we will configure this to fetch and display aggregated OpenAPIs)
app.get('/api-docs', (_req, res) => {
  res.status(200).send('Unified API Documentation Gateway Dashboard. Active in container mode.');
});

// 7. Base Health check for Gateway
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'success',
    timestamp: new Date().toISOString(),
    service: 'api-gateway',
    message: 'API Gateway is online and routing traffic.',
  });
});

// 8. JSON 404 for anything not routed above
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: `Cannot find ${req.method} ${req.path}` });
});

// 9. Centralized Error Handler for Gateway (Ensures JSON errors always, never raw HTML)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('❌ [Gateway] Unhandled Error:', err);
  if (res.headersSent) return;
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal Server Error',
  });
});

app.listen(PORT, () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
  console.log(`🔑 Routing /api/auth -> ${AUTH_URL}`);
  console.log(`📦 Routing /api/products -> ${CATALOG_URL}`);
  console.log(`🛒 Routing /api/cart -> ${CART_URL}`);
  console.log(`💳 Routing /api/orders -> ${ORDER_URL}`);
  console.log(`🔔 Routing /api/notifications -> ${NOTIFICATION_URL}`);
  console.log(`📝 Routing /api/blogs -> ${CONTENT_URL}`);
});
