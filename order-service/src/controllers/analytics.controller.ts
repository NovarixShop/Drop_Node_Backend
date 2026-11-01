import { Request, Response, NextFunction } from 'express';
import { analyticsService } from '../services/analytics.service';

export class AnalyticsController {
  public async getDashboard(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await analyticsService.getDashboardStats();
      res.status(200).json({
        status: 'success',
        data: { stats },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const analyticsController = new AnalyticsController();
export default analyticsController;
