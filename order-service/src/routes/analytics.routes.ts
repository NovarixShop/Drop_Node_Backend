import { Router } from 'express';
import { analyticsController } from '../controllers/analytics.controller';
import { protect, restrictTo } from '@shared/middlewares/auth.middleware';
import { UserRole } from '@shared/constants';

const router = Router();

// Admin-only analytics
router.use(protect, restrictTo(UserRole.ADMIN));

router.get('/dashboard', analyticsController.getDashboard.bind(analyticsController));

export default router;
