import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { globalErrorHandler } from '@shared/middlewares/error.middleware';
import { NotFoundError } from '@shared/errors/app-error';
import { sanitizeRequest } from '@shared/middlewares/sanitize.middleware';
import router from './routes';
import uploadRouter from './routes/upload.routes';

const app = express();
app.disable('x-powered-by');

// Services are only reachable through the API gateway, which sets X-Forwarded-For to the real client IP
app.set('trust proxy', 1);

app.use(helmet());
// No CORS here on purpose: browsers only talk to the API gateway, which owns the CORS policy.
// (A permissive policy here used to override the gateway's allow-list on every proxied response.)

// 50kb: a product can carry up to 10 image URLs of up to 2048 characters each
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));
app.use(sanitizeRequest);

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`[CatalogService] ${req.method} ${req.originalUrl} ${res.statusCode} - ${Date.now() - start}ms`);
  });
  next();
});

// Product images: mounted before the rate limiter so a product grid's image requests don't use up the
// visitor's API budget. Uploading still requires an admin/vendor token.
app.use('/api/uploads', uploadRouter);

// Limit requests
const limiter = rateLimit({
  max: 600,
  windowMs: 15 * 60 * 1000,
  message: 'Too many requests, please try again in 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  // Service-to-service calls (blocked at the gateway, key-protected) must not share the public budget:
  // without a forwarded client IP they all count against the calling container's IP.
  skip: (req) => req.path.startsWith('/internal/'),
});
app.use('/api', limiter);

// Mount main routes under prefix
app.use('/api', router);

// Health Check Route
app.get('/api/health', (_req, res) => {
  const mongooseStatus = require('mongoose').connection.readyState;
  res.status(200).json({
    status: 'success',
    timestamp: new Date().toISOString(),
    service: 'catalog-service',
    database: mongooseStatus === 1 ? 'healthy' : 'unhealthy',
  });
});

// Handle unhandled routes (404s)
app.all('*', (req: Request, _res: Response, next: NextFunction) => {
  next(new NotFoundError(`Cannot find ${req.method} ${req.originalUrl} on this server`));
});

// Centralized error handler from @shared
app.use(globalErrorHandler);

export default app;
