import { Router } from 'express';
import cartRouter from './cart.routes';
import wishlistRouter from './wishlist.routes';
import couponRouter from './coupon.routes';
import rewardRouter from './reward.routes';
import internalRouter from './internal.routes';

const router = Router();

// Public / Protected user endpoints
router.use('/cart', cartRouter);
router.use('/wishlist', wishlistRouter);
router.use('/coupons', couponRouter);
router.use('/rewards', rewardRouter);

// Internal microservice-to-microservice endpoints
router.use('/internal', internalRouter);

export default router;
