import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.config';
import { globalErrorHandler } from './middlewares/error.middleware';
import { NotFoundError } from './errors/app-error';
import { logger } from './config/logger.config';
import redisCache from './config/redis.config';

const app = express();

// Set security HTTP headers
app.use(helmet());

// Enable CORS
const allowedOrigins = [env.CLIENT_URL, 'http://localhost:3001', 'http://localhost:3000'];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Allow during dev
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

// Body parser, reading data from body into req.body
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Simple request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Limit requests from same API (Rate limiting)
const limiter = rateLimit({
  max: 100, // Limit each IP to 100 requests per windowMs
  windowMs: 15 * 60 * 1000, // 15 minutes
  message: 'Too many requests from this IP, please try again in 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiter to all api routes
app.use(env.API_PREFIX, limiter);

// Swagger API Documentation Dashboard
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.config';
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Base Health Check Route
app.get('/api/health', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const mongooseStatus = require('mongoose').connection.readyState;
    const redisStatus = redisCache.getStatus();
    
    // mongoose states: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    const dbHealthy = mongooseStatus === 1;
    
    res.status(200).json({
      status: 'success',
      timestamp: new Date().toISOString(),
      services: {
        database: dbHealthy ? 'healthy' : 'unhealthy',
        cache: redisStatus.isConnected ? 'healthy' : 'unhealthy (using in-memory fallback)',
      },
      env: env.NODE_ENV,
    });
  } catch (err) {
    next(err);
  }
});

// Mount main API routes
import router from './routes';
app.use(env.API_PREFIX, router);

// Handle unhandled routes (404s)
app.all('*', (req: Request, _res: Response, next: NextFunction) => {
  next(new NotFoundError(`Cannot find ${req.method} ${req.originalUrl} on this server`));
});

// Centralized error handler
app.use(globalErrorHandler);

export default app;
