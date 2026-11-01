import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { globalErrorHandler } from '@shared/middlewares/error.middleware';
import { NotFoundError } from '@shared/errors/app-error';
import router from './routes';

const app = express();

// Services are only reachable through the API gateway, which sets X-Forwarded-For to the real client IP
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`[OrderService] ${req.method} ${req.originalUrl} ${res.statusCode} - ${Date.now() - start}ms`);
  });
  next();
});

// Limit requests
const limiter = rateLimit({
  max: 200,
  windowMs: 15 * 60 * 1000,
  message: 'Too many requests, please try again in 15 minutes.',
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
    service: 'order-service',
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
