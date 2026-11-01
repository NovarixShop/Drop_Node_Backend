import './register-aliases';
import dotenv from 'dotenv';
import path from 'path';

// Load env variables before other imports
dotenv.config({ path: path.join(__dirname, '../.env') });

import app from './app';
import { connectDB } from './config/db.config';
import { redisCache } from './config/redis.config';

process.on('uncaughtException', (err: Error) => {
  console.error('❌ [CatalogService] UNCAUGHT EXCEPTION! Shutting down...', err);
  process.exit(1);
});

const startServer = async () => {
  // 1. Connect to Database
  await connectDB();

  // 2. Connect to Redis (graceful fallback)
  await redisCache.connect();

  const PORT = process.env.PORT || 5002;
  const server = app.listen(PORT, () => {
    console.log(`🚀 [CatalogService] running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  });

  process.on('unhandledRejection', (err: Error) => {
    console.error('❌ [CatalogService] UNHANDLED REJECTION! Shutting down...', err);
    server.close(() => {
      process.exit(1);
    });
  });
};

startServer();
