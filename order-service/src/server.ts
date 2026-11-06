import './register-aliases';
import dotenv from 'dotenv';
import path from 'path';

// Load env variables before other imports
dotenv.config({ path: path.join(__dirname, '../.env') });

import app from './app';
import { assertSecureEnv } from '@shared/utils/env';
import { connectDB } from './config/db.config';
import { redisCache } from './config/redis.config';
import { reportRazorpayConfig } from './config/razorpay.config';

process.on('uncaughtException', (err: Error) => {
  console.error('❌ [OrderService] UNCAUGHT EXCEPTION! Shutting down...', err);
  process.exit(1);
});

const startServer = async () => {
  // 0. Refuse to boot production with missing/placeholder secrets
  assertSecureEnv('OrderService', ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'INTERNAL_API_KEY']);

  // 1. Connect to Database
  await connectDB();

  // 2. Connect to Redis (graceful fallback)
  await redisCache.connect();

  // 3. Say up front whether card checkout is live, rather than failing at the till
  reportRazorpayConfig();

  const PORT = process.env.PORT || 5004;
  const server = app.listen(PORT, () => {
    console.log(`🚀 [OrderService] running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  });

  process.on('unhandledRejection', (err: Error) => {
    console.error('❌ [OrderService] UNHANDLED REJECTION! Shutting down...', err);
    server.close(() => {
      process.exit(1);
    });
  });
};

startServer();
