import { Router } from 'express';
import orderRouter from './order.routes';
import paymentRouter from './payment.routes';
import trackingRouter from './tracking.routes';
import analyticsRouter from './analytics.routes';

const router = Router();

// Mount individual module routers
router.use('/orders', orderRouter);
router.use('/payments', paymentRouter);
router.use('/tracking', trackingRouter);
router.use('/admin/analytics', analyticsRouter);

export default router;
