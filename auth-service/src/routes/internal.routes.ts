import { Router, Request, Response, NextFunction } from 'express';
import { User } from '../models/user.model';
import { UserRole } from '@shared/constants';

const router = Router();

// 1. Count customers for the admin analytics dashboard (Internal REST call)
router.get('/users/count', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const customers = await User.countDocuments({ role: UserRole.CUSTOMER }).exec();
    res.status(200).json({
      status: 'success',
      data: { customers },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
