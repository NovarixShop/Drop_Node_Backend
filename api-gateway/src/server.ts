import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import proxy from 'express-http-proxy';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// Set TRUST_PROXY (e.g. "1") when the gateway sits behind a reverse proxy so req.ip is the real client IP
if (process.env.TRUST_PROXY) {
  const trustProxy = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isNaN(trustProxy) ? process.env.TRUST_PROXY : trustProxy);
}

// 1. Security Headers
app.use(helmet());

// 2. CORS Policies
const allowedOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',') 
  : ['http://localhost:3000', 'http://localhost:3001', 'https://www.admin.com', 'https://cms.admin.com', 'https://admin.com'];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

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
const AUTH_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:5001';
const CATALOG_URL = process.env.CATALOG_SERVICE_URL || 'http://localhost:5002';
const CART_URL = process.env.CART_SERVICE_URL || 'http://localhost:5003';
const ORDER_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:5004';
const NOTIFICATION_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:5005';
const CONTENT_URL = process.env.CONTENT_SERVICE_URL || 'http://localhost:5006';

const forwardTo = (target: string, prefix: string) =>
  proxy(target, {
    proxyReqPathResolver: (req: any) => prefix + req.url,
    // Pass the real client IP so downstream rate limiters don't lump every user under the gateway's IP
    proxyReqOptDecorator: (proxyReqOpts: any, srcReq: any) => {
      proxyReqOpts.headers = proxyReqOpts.headers || {};
      proxyReqOpts.headers['x-forwarded-for'] = srcReq.ip;
      return proxyReqOpts;
    },
  });

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

app.listen(PORT, () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
  console.log(`🔑 Routing /api/auth -> ${AUTH_URL}`);
  console.log(`📦 Routing /api/products -> ${CATALOG_URL}`);
  console.log(`🛒 Routing /api/cart -> ${CART_URL}`);
  console.log(`💳 Routing /api/orders -> ${ORDER_URL}`);
  console.log(`🔔 Routing /api/notifications -> ${NOTIFICATION_URL}`);
  console.log(`📝 Routing /api/blogs -> ${CONTENT_URL}`);
});
