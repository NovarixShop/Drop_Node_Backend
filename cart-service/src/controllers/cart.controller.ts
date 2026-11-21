import { Request, Response, NextFunction } from 'express';
import { cartService } from '../services/cart.service';
import { z } from 'zod';

const addToCartSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').optional().default(1),
  size: z.string().optional().default(''),
  color: z.string().optional().default(''),
});

const updateQuantitySchema = z.object({
  quantity: z.coerce.number().int().nonnegative('Quantity cannot be negative'),
});

const applyCouponSchema = z.object({
  code: z.string().min(1, 'Coupon code is required').trim(),
});

export class CartController {
  public async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.authUser!.id;
      const cart = await cartService.getCart(userId);
      res.status(200).json({
        status: 'success',
        data: { cart },
      });
    } catch (error) {
      next(error);
    }
  }

  public async add(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.authUser!.id;
      const { productId, quantity, size, color } = addToCartSchema.parse(req.body);
      const cart = await cartService.addToCart(userId, productId, quantity, size, color);

      res.status(200).json({
        status: 'success',
        message: 'Product added to cart',
        data: { cart },
      });
    } catch (error) {
      next(error);
    }
  }

  public async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.authUser!.id;
      const productId = req.params.productId;
      const { quantity } = updateQuantitySchema.parse(req.body);
      const cart = await cartService.updateQuantity(userId, productId, quantity);

      res.status(200).json({
        status: 'success',
        message: 'Cart updated',
        data: { cart },
      });
    } catch (error) {
      next(error);
    }
  }

  public async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.authUser!.id;
      const productId = req.params.productId;
      const cart = await cartService.removeFromCart(userId, productId);

      res.status(200).json({
        status: 'success',
        message: 'Product removed from cart',
        data: { cart },
      });
    } catch (error) {
      next(error);
    }
  }

  public async applyCoupon(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.authUser!.id;
      const { code } = applyCouponSchema.parse(req.body);
      const cart = await cartService.applyCoupon(userId, code);

      res.status(200).json({
        status: 'success',
        message: 'Coupon applied successfully',
        data: { cart },
      });
    } catch (error) {
      next(error);
    }
  }

  public async removeCoupon(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.authUser!.id;
      const cart = await cartService.removeCoupon(userId);

      res.status(200).json({
        status: 'success',
        message: 'Coupon removed successfully',
        data: { cart },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const cartController = new CartController();
export default cartController;
