import './register-aliases';
import dotenv from 'dotenv';
import path from 'path';

// Load env variables before other imports
dotenv.config({ path: path.join(__dirname, '../.env') });

import app from './app';
import { connectDB } from './config/db.config';
import { startNotificationWorker } from './workers/notification.worker';

process.on('uncaughtException', (err: Error) => {
  console.error('❌ [NotificationService] UNCAUGHT EXCEPTION! Shutting down...', err);
  process.exit(1);
});

const startServer = async () => {
  // 1. Connect to Database
  await connectDB();

  // 2. Start background Redis Pub/Sub event subscriber worker
  startNotificationWorker();

  const PORT = process.env.PORT || 5005;
  const server = app.listen(PORT, () => {
    console.log(`🚀 [NotificationService] running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  });

  process.on('unhandledRejection', (err: Error) => {
    console.error('❌ [NotificationService] UNHANDLED REJECTION! Shutting down...', err);
    server.close(() => {
      process.exit(1);
    });
  });
};

startServer();
