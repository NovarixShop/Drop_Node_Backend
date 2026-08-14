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

// TEST ROUTE TO BYPASS HTTP-PROXY-MIDDLEWARE
app.use('/api/test-login', express.json(), async (req, res) => {
  try {
    const response = await fetch('http://auth-service:5001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const text = await response.text();
    res.status(response.status).send(text);
  } catch (e) {
    res.status(500).send('FETCH ERROR: ' + (e as Error).message);
  }
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

// Auth & User Service Proxy
app.use('/api/auth', proxy(AUTH_URL, { proxyReqPathResolver: (req: any) => '/api/auth' + req.url }));
app.use('/api/users', proxy(AUTH_URL, { proxyReqPathResolver: (req: any) => '/api/users' + req.url }));

// Catalog & Product Service Proxy
app.use('/api/products', proxy(CATALOG_URL, { proxyReqPathResolver: (req: any) => '/api/products' + req.url }));
app.use('/api/categories', proxy(CATALOG_URL, { proxyReqPathResolver: (req: any) => '/api/categories' + req.url }));
app.use('/api/deals', proxy(CATALOG_URL, { proxyReqPathResolver: (req: any) => '/api/deals' + req.url }));
app.use('/api/inventory', proxy(CATALOG_URL, { proxyReqPathResolver: (req: any) => '/api/inventory' + req.url }));

// Cart & Wishlist Service Proxy
app.use('/api/cart', proxy(CART_URL, { proxyReqPathResolver: (req: any) => '/api/cart' + req.url }));
app.use('/api/wishlist', proxy(CART_URL, { proxyReqPathResolver: (req: any) => '/api/wishlist' + req.url }));
app.use('/api/coupons', proxy(CART_URL, { proxyReqPathResolver: (req: any) => '/api/coupons' + req.url }));

// Order & Checkout Service Proxy
app.use('/api/orders', proxy(ORDER_URL, { proxyReqPathResolver: (req: any) => '/api/orders' + req.url }));
app.use('/api/payments', proxy(ORDER_URL, { proxyReqPathResolver: (req: any) => '/api/payments' + req.url }));
app.use('/api/tracking', proxy(ORDER_URL, { proxyReqPathResolver: (req: any) => '/api/tracking' + req.url }));

// Notification Service Proxy
app.use('/api/notifications', proxy(NOTIFICATION_URL, { proxyReqPathResolver: (req: any) => '/api/notifications' + req.url }));

// CMS & Blog Service Proxy
app.use('/api/blogs', proxy(CONTENT_URL, { proxyReqPathResolver: (req: any) => '/api/blogs' + req.url }));
app.use('/api/cms', proxy(CONTENT_URL, { proxyReqPathResolver: (req: any) => '/api/cms' + req.url }));

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
