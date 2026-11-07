import { Request, Response, NextFunction } from 'express';
import { productService } from '../services/product.service';
import { z } from 'zod';
import { isSafeImageUrl } from '../utils/image-file';
import { MAX_PRODUCT_IMAGES } from '../config/upload.config';

// Each image is either an uploaded file (returned by POST /api/uploads/products) or an external http(s) URL.
// The first image is the product's main image.
const imagesSchema = z
  .array(
    z
      .string()
      .trim()
      .max(2048, 'Image URL is too long')
      .refine(isSafeImageUrl, 'Each image must be a valid http(s) URL')
  )
  .max(MAX_PRODUCT_IMAGES, `A product can have at most ${MAX_PRODUCT_IMAGES} images`)
  .transform((urls) => Array.from(new Set(urls)));

// Zod 4 applies .default() even inside .partial(), so an update schema built from the create schema would
// silently reset omitted fields (e.g. images -> [], stock -> 0). Updates therefore use the default-free fields.
const productFields = {
  name: z.string().min(2, 'Product name must be at least 2 characters').max(100),
  description: z.string().min(10, 'Description must be at least 10 characters').max(2000),
  price: z.coerce.number().positive('Price must be a positive number'),
  // null clears a previously set compare-at price (an omitted field would leave the old value in place)
  compareAtPrice: z
    .union([z.null(), z.coerce.number().positive('Compare-at price must be positive')])
    .optional(),
  category: z.string().min(1, 'Category ID is required'),
  images: imagesSchema,
  stock: z.coerce.number().nonnegative('Stock cannot be negative'),
  lowStockThreshold: z.coerce.number().nonnegative('Threshold cannot be negative'),
};

const createProductSchema = z.object({
  ...productFields,
  images: productFields.images.default([]),
  stock: productFields.stock.default(0),
  lowStockThreshold: productFields.lowStockThreshold.default(5),
});

// Only plain string query params reach the services (?category=a&category=b would otherwise be an array)
const stringParams = (query: Request['query']): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
};

const updateProductSchema = z.object(productFields).partial();

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
      const result = await productService.getProducts(stringParams(req.query));
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

  public async getSimilar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const products = await productService.getSimilarProducts(req.params.id, stringParams(req.query).limit);
      res.status(200).json({
        status: 'success',
        data: { products },
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
      const result = await productService.getProductReviews(productId, stringParams(req.query));

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
