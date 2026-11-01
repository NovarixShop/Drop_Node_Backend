import { Router } from 'express';
import { rewardController } from '../controllers/reward.controller';
import { protect } from '@shared/middlewares/auth.middleware';

const router = Router();

// Protect all reward routes
router.use(protect);

router.get('/', rewardController.getSummary.bind(rewardController));
router.post('/spin', rewardController.spin.bind(rewardController));
router.post('/scratch', rewardController.scratch.bind(rewardController));

export default router;
