import { Router } from 'express';
import authRouter from './auth.routes';
import userRouter from './user.routes';
import categoryRouter from './category.routes';
import productRouter from './product.routes';
import inventoryRouter from './inventory.routes';
import cartRouter from './cart.routes';
import wishlistRouter from './wishlist.routes';
import orderRouter from './order.routes';
import paymentRouter from './payment.routes';
import trackingRouter from './tracking.routes';
import couponRouter from './coupon.routes';
import dealRouter from './deal.routes';
import blogRouter from './blog.routes';
import cmsRouter from './cms.routes';
import notificationRouter from './notification.routes';
import analyticsRouter from './analytics.routes';
import gamificationRouter from './gamification.routes';

const router = Router();

// Mount individual module routers
router.use('/auth', authRouter);
router.use('/users', userRouter);
router.use('/categories', categoryRouter);
router.use('/products', productRouter);
router.use('/inventory', inventoryRouter);
router.use('/cart', cartRouter);
router.use('/wishlist', wishlistRouter);
router.use('/orders', orderRouter);
router.use('/payments', paymentRouter);
router.use('/tracking', trackingRouter);
router.use('/coupons', couponRouter);
router.use('/deals', dealRouter);
router.use('/blogs', blogRouter);
router.use('/cms', cmsRouter);
router.use('/notifications', notificationRouter);
router.use('/gamification', gamificationRouter);
router.use('/admin/analytics', analyticsRouter);

export default router;
