import { Request, Response, NextFunction } from 'express';
import { dealRepository } from '../repositories/deal.repository';
import { z } from 'zod';
import { BadRequestError } from '@shared/errors/app-error';

const createDealSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50),
  description: z.string().min(5, 'Description must be at least 5 characters'),
  discountPercentage: z.coerce.number().int().min(1, 'Discount must be at least 1%').max(99, 'Discount cannot exceed 99%'),
  startTime: z.string().datetime('Start time must be a valid ISO datetime').transform((val) => new Date(val)),
  endTime: z.string().datetime('End time must be a valid ISO datetime').transform((val) => new Date(val)),
  products: z.array(z.string()).min(1, 'At least one product is required for the deal'),
});

export class DealController {
  public async getActive(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deals = await dealRepository.findActiveDeals();
      res.status(200).json({
        status: 'success',
        data: { deals },
      });
    } catch (error) {
      next(error);
    }
  }

  public async getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deals = await dealRepository.findAll();
      res.status(200).json({
        status: 'success',
        data: { deals },
      });
    } catch (error) {
      next(error);
    }
  }

  public async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedBody = createDealSchema.parse(req.body);

      if (validatedBody.endTime <= validatedBody.startTime) {
        throw new BadRequestError('End time must be after start time');
      }

      const deal = await dealRepository.create(validatedBody);

      res.status(201).json({
        status: 'success',
        message: 'Promo deal scheduled successfully',
        data: { deal },
      });
    } catch (error) {
      next(error);
    }
  }

  public async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await dealRepository.delete(id);

      res.status(200).json({
        status: 'success',
        message: 'Deal deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const dealController = new DealController();
export default dealController;
