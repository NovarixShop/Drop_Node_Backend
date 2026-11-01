import { Router, Request, Response, NextFunction } from 'express';
import { cartService } from '../services/cart.service';
import { cartRepository } from '../repositories/cart.repository';
import { Coupon } from '../models/coupon.model';
import { rewardService } from '../services/reward.service';

const router = Router();

// 1. Get user cart for checkout (Internal REST call)
router.get('/cart/:userId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { userId } = req.params;
  try {
    // Recalculate with current catalog prices so checkout never charges stale totals
    const storedCart = await cartRepository.getOrCreateCart(userId);
    await cartService.recalculateTotals(storedCart);
    const savedCart = await cartRepository.save(storedCart);
    const cart = await cartService.populateCartProducts(savedCart);
    res.status(200).json({
      status: 'success',
      data: { cart },
    });
  } catch (error) {
    next(error);
  }
});

// 2. Clear user cart after successful checkout (Internal REST call)
router.post('/cart/:userId/clear', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { userId } = req.params;
  try {
    const cart = await cartRepository.getOrCreateCart(userId);

    // Called after a successful checkout: count the coupon redemption so usage limits are enforced
    if (cart.couponCode) {
      await Coupon.updateOne({ code: cart.couponCode }, { $inc: { usageCount: 1 } }).exec();
    }

    // Each order earns a scratch card and unlocks the daily spin
    await rewardService.recordPurchase(userId);

    cart.items = [];
    cart.couponCode = null;
    await cartService.recalculateTotals(cart);
    await cartRepository.save(cart);

    res.status(200).json({
      status: 'success',
      message: 'Cart cleared successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
