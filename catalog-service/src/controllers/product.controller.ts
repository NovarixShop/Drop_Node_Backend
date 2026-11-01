import { Request, Response, NextFunction } from 'express';
import { productService } from '../services/product.service';
import { z } from 'zod';

const createProductSchema = z.object({
  name: z.string().min(2, 'Product name must be at least 2 characters').max(100),
  description: z.string().min(10, 'Description must be at least 10 characters').max(2000),
  price: z.coerce.number().positive('Price must be a positive number'),
  compareAtPrice: z.coerce.number().positive('Compare-at price must be positive').optional(),
  category: z.string().min(1, 'Category ID is required'),
  images: z.array(z.string()).optional().default([]),
  stock: z.coerce.number().nonnegative('Stock cannot be negative').optional().default(0),
  lowStockThreshold: z.coerce.number().nonnegative('Threshold cannot be negative').optional().default(5),
});

const updateProductSchema = createProductSchema.partial();

const submitReviewSchema = z.object({
  rating: z.coerce.number().int().min(1, 'Rating must be between 1 and 5').max(5, 'Rating must be between 1 and 5'),
  comment: z.string().min(3, 'Review comment must be at least 3 characters').max(500),
});

const restockSchema = z.object({
  quantity: z.coerce.number().int('Quantity must be an integer'),
});

export class ProductController {
  public async getProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await productService.getProducts(req.query);
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public async getBySlug(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { slug } = req.params;
      const product = await productService.getProductBySlug(slug);
      res.status(200).json({
        status: 'success',
        data: { product },
      });
    } catch (error) {
      next(error);
    }
  }

  public async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const product = await productService.getProductById(req.params.id);
      res.status(200).json({
        status: 'success',
        data: { product },
      });
    } catch (error) {
      next(error);
    }
  }

  public async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedBody = createProductSchema.parse(req.body);
      const product = await productService.createProduct(validatedBody);

      res.status(201).json({
        status: 'success',
        message: 'Product created successfully',
        data: { product },
      });
    } catch (error) {
      next(error);
    }
  }

  public async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const validatedBody = updateProductSchema.parse(req.body);
      const product = await productService.updateProduct(id, validatedBody);

      res.status(200).json({
        status: 'success',
        message: 'Product updated successfully',
        data: { product },
      });
    } catch (error) {
      next(error);
    }
  }

  public async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await productService.deleteProduct(id);

      res.status(200).json({
        status: 'success',
        message: 'Product deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public async submitReview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const productId = req.params.id;
      const userId = req.authUser!.id;
      const { rating, comment } = submitReviewSchema.parse(req.body);

      const review = await productService.submitReview(productId, userId, rating, comment);

      res.status(201).json({
        status: 'success',
        message: 'Review submitted successfully',
        data: { review },
      });
    } catch (error) {
      next(error);
    }
  }

  public async getReviews(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const productId = req.params.id;
      const result = await productService.getProductReviews(productId, req.query);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public async restock(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const productId = req.params.id;
      const { quantity } = restockSchema.parse(req.body);

      const product = await productService.restockProduct(productId, quantity);

      res.status(200).json({
        status: 'success',
        message: `Product stock adjusted by ${quantity} units.`,
        data: { product },
      });
    } catch (error) {
      next(error);
    }
  }

  public async getLowStockAlerts(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const products = await productService.getLowStockAlerts();
      res.status(200).json({
        status: 'success',
        data: { products },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const productController = new ProductController();
export default productController;
