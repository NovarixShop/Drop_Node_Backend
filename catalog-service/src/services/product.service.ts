import { productRepository, ProductRepository } from '../repositories/product.repository';
import { reviewRepository, ReviewRepository } from '../repositories/review.repository';
import { categoryRepository } from '../repositories/category.repository';
import { IProduct } from '../models/product.model';
import { IReview } from '../models/review.model';
import { BadRequestError, NotFoundError } from '@shared/errors/app-error';
import { redisCache } from '../config/redis.config';
import { logger } from '@shared/utils/logger';
import { Category } from '../models/category.model';
import { Product } from '../models/product.model';
import { isValidObjectId } from 'mongoose';

const PRODUCT_CACHE_PREFIX = 'products:slug:';

export class ProductService {
  private productRepo: ProductRepository;
  private reviewRepo: ReviewRepository;

  constructor(productRepo = productRepository, reviewRepo = reviewRepository) {
    this.productRepo = productRepo;
    this.reviewRepo = reviewRepo;
  }

  // Create a new product
  public async createProduct(productData: Partial<IProduct>): Promise<IProduct> {
    if (!productData.name || !productData.price || !productData.category) {
      throw new BadRequestError('Product name, price, and category are required');
    }

    const slug = productData.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '') + '-' + Date.now().toString().slice(-4);

    const categoryExists = await categoryRepository.findById(productData.category.toString());
    if (!categoryExists) {
      throw new NotFoundError('Category not found');
    }

    const product = await this.productRepo.create({
      ...productData,
      slug,
      isActive: true,
    });

    return product;
  }

  // Get product by slug (Cached with Redis)
  public async getProductBySlug(slug: string): Promise<IProduct> {
    const cacheKey = `${PRODUCT_CACHE_PREFIX}${slug}`;

    try {
      const cached = await redisCache.get<IProduct>(cacheKey);
      if (cached) {
        logger.info(`🧠 Product retrieved from cache: ${slug}`);
        return cached;
      }
    } catch (err) {
      logger.error('Redis GET error in ProductService:', err);
    }

    const product = await this.productRepo.findBySlug(slug);
    if (!product) {
      throw new NotFoundError('Product not found');
    }

    try {
      await redisCache.set(cacheKey, product, 3600);
      logger.info(`🧠 Product saved to cache: ${slug}`);
    } catch (err) {
      logger.error('Redis SET error in ProductService:', err);
    }

    return product;
  }

  // Get product by id (admin: includes inactive products)
  public async getProductById(id: string): Promise<IProduct> {
    if (!isValidObjectId(id)) {
      throw new NotFoundError('Product not found');
    }

    const product = await this.productRepo.findById(id);
    if (!product) {
      throw new NotFoundError('Product not found');
    }
    return product;
  }

  // "Similar products" for the product page: other active products from the same category first
  // (in-stock, best rated, then newest), topped up from the parent/sibling categories when the
  // category itself has too few products.
  public async getSimilarProducts(id: string, limitParam?: string): Promise<IProduct[]> {
    if (!isValidObjectId(id)) {
      throw new NotFoundError('Product not found');
    }

    const limit = Math.min(Math.max(parseInt(limitParam || '12', 10) || 12, 1), 24);

    const product = await Product.findById(id).select('category').lean().exec();
    if (!product || !product.category) {
      throw new NotFoundError('Product not found');
    }

    const categoryId = product.category.toString();
    const fields = 'name slug price compareAtPrice images stock averageRating totalReviews category';
    const sort = { averageRating: -1 as const, totalReviews: -1 as const, createdAt: -1 as const };

    const findIn = (categoryIds: string[], excludeIds: string[], inStockOnly: boolean, max: number) =>
      Product.find({
        _id: { $nin: excludeIds },
        category: { $in: categoryIds },
        isActive: true,
        ...(inStockOnly ? { stock: { $gt: 0 } } : {}),
      })
        .select(fields)
        .sort(sort)
        .limit(max)
        .populate('category', 'name slug')
        .lean()
        .exec();

    const results: any[] = [];
    const seen = (): string[] => [id, ...results.map((p) => p._id.toString())];

    // 1. Same category, in stock
    results.push(...(await findIn([categoryId], seen(), true, limit)));

    // 2. Related categories (parent + siblings + children), in stock
    if (results.length < limit) {
      const category = await Category.findById(categoryId).select('parentCategory').lean().exec();
      const rootId = category?.parentCategory ? category.parentCategory.toString() : categoryId;
      const familyIds = (await this.getCategoryFamilyIds(rootId)).filter((cid) => cid !== categoryId);
      if (familyIds.length > 0) {
        results.push(...(await findIn(familyIds, seen(), true, limit - results.length)));
      }
    }

    // 3. Same category, out of stock (still useful to show, like big marketplaces do)
    if (results.length < limit) {
      results.push(...(await findIn([categoryId], seen(), false, limit - results.length)));
    }

    // Listing cards only need the first two images (main + hover image)
    return results.map((p) => ({ ...p, images: (p.images || []).slice(0, 2) })) as IProduct[];
  }

  // Update a product
  public async updateProduct(id: string, updateData: Partial<IProduct>): Promise<IProduct> {
    const product = await this.productRepo.findById(id);
    if (!product) {
      throw new NotFoundError('Product not found');
    }

    if (updateData.name && updateData.name !== product.name) {
      updateData.slug = updateData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '') + '-' + Date.now().toString().slice(-4);
    }

    if (updateData.category) {
      const categoryExists = await categoryRepository.findById(updateData.category.toString());
      if (!categoryExists) {
        throw new NotFoundError('Category not found');
      }
    }

    const updatedProduct = await this.productRepo.update(id, updateData);
    if (!updatedProduct) {
      throw new NotFoundError('Product not found');
    }

    await this.invalidateProductCache(product.slug);
    if (updatedProduct.slug !== product.slug) {
      await this.invalidateProductCache(updatedProduct.slug);
    }

    return updatedProduct;
  }

  // Delete a product
  public async deleteProduct(id: string): Promise<void> {
    const product = await this.productRepo.findById(id);
    if (!product) {
      throw new NotFoundError('Product not found');
    }

    await this.productRepo.delete(id);
    await this.invalidateProductCache(product.slug);
  }

  // Query products with advanced filtering and search
  public async getProducts(query: {
    page?: string;
    limit?: string;
    search?: string;
    category?: string;
    minPrice?: string;
    maxPrice?: string;
    rating?: string;
    inStock?: string;
    sort?: string;
  }): Promise<{ products: IProduct[]; total: number; page: number; limit: number; pages: number }> {
    const page = Math.max(parseInt(query.page || '1', 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(query.limit || '12', 10) || 12, 1), 100);
    const skip = (page - 1) * limit;

    const filter: any = { isActive: true };

    if (query.search) {
      filter.$text = { $search: query.search };
    }

    if (query.minPrice || query.maxPrice) {
      filter.price = {};
      if (query.minPrice) filter.price.$gte = parseFloat(query.minPrice);
      if (query.maxPrice) filter.price.$lte = parseFloat(query.maxPrice);
    }

    if (query.rating) {
      filter.averageRating = { $gte: parseFloat(query.rating) };
    }

    if (query.inStock === 'true') {
      filter.stock = { $gt: 0 };
    }

    if (query.category) {
      // The storefront filters by category slug, the CMS by id: accept both
      let categoryId: string | null = query.category;
      if (!isValidObjectId(query.category)) {
        const category = await categoryRepository.findBySlug(query.category.toLowerCase());
        categoryId = category ? category._id.toString() : null;
      }

      if (!categoryId) {
        return { products: [], total: 0, page, limit, pages: 0 };
      }

      const categoryIds = await this.getCategoryFamilyIds(categoryId);
      filter.category = { $in: categoryIds };
    }

    let sort: any = { createdAt: -1 };
    if (query.sort) {
      switch (query.sort) {
        case 'price-asc':
          sort = { price: 1 };
          break;
        case 'price-desc':
          sort = { price: -1 };
          break;
        case 'rating':
          sort = { averageRating: -1 };
          break;
        case 'oldest':
          sort = { createdAt: 1 };
          break;
        case 'newest':
        default:
          sort = { createdAt: -1 };
          break;
      }
    }

    const { products, total } = await this.productRepo.findAndCount(filter, skip, limit, sort);

    return {
      products,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  // Submit product review
  public async submitReview(
    productId: string,
    userId: string,
    rating: number,
    comment: string
  ): Promise<IReview> {
    const product = await this.productRepo.findById(productId);
    if (!product) {
      throw new NotFoundError('Product not found');
    }

    const existingReview = await this.reviewRepo.findByUserAndProduct(userId, productId);
    if (existingReview) {
      throw new BadRequestError('You have already reviewed this product. Update or delete your existing review.');
    }

    const review = await this.reviewRepo.create({
      product: product._id as any,
      user: userId as any,
      rating,
      comment,
    });

    await this.invalidateProductCache(product.slug);

    return review;
  }

  // Get product reviews
  public async getProductReviews(
    productId: string,
    query: { page?: string; limit?: string }
  ): Promise<{ reviews: IReview[]; total: number; page: number; pages: number }> {
    if (!isValidObjectId(productId)) {
      throw new NotFoundError('Product not found');
    }

    // Keep page/limit in range: ?limit=0 or ?page=-1 used to error, and a huge limit returned every review
    const page = Math.max(parseInt(query.page || '1', 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(query.limit || '5', 10) || 5, 1), 50);
    const skip = (page - 1) * limit;

    const { reviews, total } = await this.reviewRepo.findAndCount({ product: productId }, skip, limit);

    return {
      reviews,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  // Inventory: Restock/adjust stock
  public async restockProduct(productId: string, quantity: number): Promise<IProduct> {
    const product = await this.productRepo.findById(productId);
    if (!product) {
      throw new NotFoundError('Product not found');
    }

    const updatedProduct = await this.productRepo.adjustStock(productId, quantity);
    if (!updatedProduct) {
      throw new NotFoundError('Product not found');
    }

    await this.invalidateProductCache(product.slug);

    return updatedProduct;
  }

  // Inventory: Get low stock alerts
  public async getLowStockAlerts(): Promise<IProduct[]> {
    const filter = {
      isActive: true,
      $expr: { $lte: ['$stock', '$lowStockThreshold'] },
    };
    const { products } = await this.productRepo.findAndCount(filter, 0, 100);
    return products;
  }

  // Helper to resolve category family IDs recursively
  private async getCategoryFamilyIds(categoryId: string): Promise<string[]> {
    const familyIds: string[] = [categoryId];
    
    const findChildren = async (parentId: string) => {
      const children = await Category.find({ parentCategory: parentId }).select('_id').exec();
      for (const child of children) {
        familyIds.push(child._id.toString());
        await findChildren(child._id.toString());
      }
    };

    await findChildren(categoryId);
    return familyIds;
  }

  // Helper to invalidate product cache
  private async invalidateProductCache(slug: string): Promise<void> {
    try {
      await redisCache.del(`${PRODUCT_CACHE_PREFIX}${slug}`);
      logger.info(`🧠 Invalidated cache for product: ${slug}`);
    } catch (err) {
      logger.error('Failed to invalidate product cache', err);
    }
  }
}

export const productService = new ProductService();
export default productService;
