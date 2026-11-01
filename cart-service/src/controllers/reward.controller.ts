import { Request, Response, NextFunction } from 'express';
import { rewardService } from '../services/reward.service';

export class RewardController {
  public async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rewards = await rewardService.getSummary(req.authUser!.id);
      res.status(200).json({
        status: 'success',
        data: { rewards },
      });
    } catch (error) {
      next(error);
    }
  }

  public async spin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await rewardService.spin(req.authUser!.id);
      res.status(200).json({
        status: 'success',
        data: { result },
      });
    } catch (error) {
      next(error);
    }
  }

  public async scratch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await rewardService.scratch(req.authUser!.id);
      res.status(200).json({
        status: 'success',
        data: { result },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const rewardController = new RewardController();
export default rewardController;
