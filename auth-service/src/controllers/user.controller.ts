import { Request, Response, NextFunction } from 'express';
import { userService } from '../services/user.service';
import { z } from 'zod';
import { AddressType, UserRole } from '@shared/constants';

const updateProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50).optional(),
  phone: z.string().max(20).optional(),
  address: z
    .object({
      street: z.string().min(1),
      city: z.string().min(1),
      state: z.string().min(1),
      postalCode: z.string().min(1),
      country: z.string().min(1),
    })
    .optional(),
});

const addAddressSchema = z.object({
  street: z.string().min(1, 'Street is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  postalCode: z.string().min(1, 'Postal code is required'),
  country: z.string().min(1, 'Country is required'),
  type: z.nativeEnum(AddressType).default(AddressType.SHIPPING),
  isDefault: z.boolean().optional().default(false),
});

const updateRoleSchema = z.object({
  role: z.nativeEnum(UserRole),
});

export class UserController {
  public async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const user = await userService.getUserProfile(userId);
      res.status(200).json({
        status: 'success',
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  public async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const validatedBody = updateProfileSchema.parse(req.body);
      const user = await userService.updateProfile(userId, validatedBody);

      res.status(200).json({
        status: 'success',
        message: 'Profile updated successfully',
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  public async getAddresses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const addresses = await userService.getAddresses(userId);
      res.status(200).json({
        status: 'success',
        data: { addresses },
      });
    } catch (error) {
      next(error);
    }
  }

  public async addAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const validatedBody = addAddressSchema.parse(req.body);
      const addresses = await userService.addAddress(userId, validatedBody);

      res.status(201).json({
        status: 'success',
        message: 'Address added successfully',
        data: { addresses },
      });
    } catch (error) {
      next(error);
    }
  }

  public async deleteAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const addressId = req.params.id;
      const addresses = await userService.deleteAddress(userId, addressId);

      res.status(200).json({
        status: 'success',
        message: 'Address deleted successfully',
        data: { addresses },
      });
    } catch (error) {
      next(error);
    }
  }

  public async getAllUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, limit, search, role } = req.query;
      const result = await userService.getAllUsers({
        page: page as string,
        limit: limit as string,
        search: search as string,
        role: role as string,
      });

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public async updateUserRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.params.id;
      const validatedBody = updateRoleSchema.parse(req.body);
      const user = await userService.updateUserRole(userId, validatedBody.role);

      res.status(200).json({
        status: 'success',
        message: 'User role updated successfully',
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();
export default userController;
