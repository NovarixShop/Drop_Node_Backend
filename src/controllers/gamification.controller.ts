import { Request, Response, NextFunction } from 'express';
import { gamificationService } from '../services/gamification.service';
import { z } from 'zod';

const claimCouponSchema = z.object({
  code: z.string().min(1, 'Coupon code is required'),
});

export class GamificationController {
  // Get gamification profile
  public async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const profile = await gamificationService.getProfile(userId);

      res.status(200).json({
        status: 'success',
        data: { profile },
      });
    } catch (error) {
      next(error);
    }
  }

  // Use a spin
  public async useSpin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const profile = await gamificationService.useSpin(userId);

      res.status(200).json({
        status: 'success',
        message: 'Spin used successfully',
        data: { profile },
      });
    } catch (error) {
      next(error);
    }
  }

  // Use a scratch card
  public async useScratchCard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const profile = await gamificationService.useScratchCard(userId);

      res.status(200).json({
        status: 'success',
        message: 'Scratch card used successfully',
        data: { profile },
      });
    } catch (error) {
      next(error);
    }
  }

  // Claim a coupon
  public async claimCoupon(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const validatedBody = claimCouponSchema.parse(req.body);
      const profile = await gamificationService.claimCoupon(userId, validatedBody.code);

      res.status(200).json({
        status: 'success',
        message: 'Coupon claimed successfully',
        data: { profile },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const gamificationController = new GamificationController();
export default gamificationController;
