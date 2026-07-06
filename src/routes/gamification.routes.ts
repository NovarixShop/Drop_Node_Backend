import { Router } from 'express';
import { gamificationController } from '../controllers/gamification.controller';
import { protect } from '../middlewares/auth.middleware';

const router = Router();

// Protect all routes under gamification router
router.use(protect);

// Get gamification profile
router.get('/profile', gamificationController.getProfile.bind(gamificationController));

// Use a spin
router.post('/spin', gamificationController.useSpin.bind(gamificationController));

// Use a scratch card
router.post('/scratch-card', gamificationController.useScratchCard.bind(gamificationController));

// Claim a coupon
router.post('/coupon', gamificationController.claimCoupon.bind(gamificationController));

export default router;
