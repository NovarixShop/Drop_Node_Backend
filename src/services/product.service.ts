import { productRepository, ProductRepository } from '../repositories/product.repository';
import { reviewRepository, ReviewRepository } from '../repositories/review.repository';
import { categoryRepository } from '../repositories/category.repository';
import { IProduct } from '../models/product.model';
import { IReview } from '../models/review.model';
import { BadRequestError, NotFoundError } from '../errors/app-error';
import { redisCache } from '../config/redis.config';
import { logger } from '../config/logger.config';
import { Category } from '../models/category.model';

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

    // Generate slug
    const slug = productData.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '') + '-' + Date.now().toString().slice(-4);

    // Verify category exists
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

    // 1. Check Cache
    try {
      const cached = await redisCache.get<IProduct>(cacheKey);
      if (cached) {
        logger.info(`🧠 Product retrieved from cache: ${slug}`);
        return cached;
      }
    } catch (err) {
      logger.error('Redis GET error in ProductService:', err);
    }

    // 2. Query Database
    const product = await this.productRepo.findBySlug(slug);
    if (!product) {
      throw new NotFoundError('Product not found');
    }

    // 3. Store in Cache (Expires in 1 hour)
    try {
      await redisCache.set(cacheKey, product, 3600);
      logger.info(`🧠 Product saved to cache: ${slug}`);
    } catch (err) {
      logger.error('Redis SET error in ProductService:', err);
    }

    return product;
  }

  // Update a product
  public async updateProduct(id: string, updateData: Partial<IProduct>): Promise<IProduct> {
    const product = await this.productRepo.findById(id);
    if (!product) {
      throw new NotFoundError('Product not found');
    }

    // If name is changing, generate a new slug
    if (updateData.name && updateData.name !== product.name) {
      updateData.slug = updateData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '') + '-' + Date.now().toString().slice(-4);
    }

    // If category is changing, verify it exists
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

    // Invalidate Cache for old and new slugs
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

    // Invalidate Cache
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
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '12', 10);
    const skip = (page - 1) * limit;

    const filter: any = { isActive: true };

    // 1. Text Search
    if (query.search) {
      filter.$text = { $search: query.search };
    }

    // 2. Price Filter
    if (query.minPrice || query.maxPrice) {
      filter.price = {};
      if (query.minPrice) filter.price.$gte = parseFloat(query.minPrice);
      if (query.maxPrice) filter.price.$lte = parseFloat(query.maxPrice);
    }

    // 3. Rating Filter
    if (query.rating) {
      filter.averageRating = { $gte: parseFloat(query.rating) };
    }

    // 4. In Stock Filter
    if (query.inStock === 'true') {
      filter.stock = { $gt: 0 };
    }

    // 5. Recursive Category Filtering (Fetch products in child categories as well!)
    if (query.category) {
      let categoryId = query.category;
      
      // If the category is not a valid ObjectId, assume it's a slug
      if (!categoryId.match(/^[0-9a-fA-F]{24}$/)) {
        const cat = await categoryRepository.findBySlug(categoryId);
        if (cat) {
          categoryId = cat._id.toString();
        } else {
          // Force no results if slug is invalid
          categoryId = '000000000000000000000000';
        }
      }
      
      // Find all categories recursively
      const categoryIds = await this.getCategoryFamilyIds(categoryId);
      filter.category = { $in: categoryIds };
    }

    // 6. Sorting Map
    let sort: any = { createdAt: -1 }; // Default
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

    // Check if user has already reviewed this product
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

    // Invalidate product cache to update the cached rating
    await this.invalidateProductCache(product.slug);

    return review;
  }

  // Get product reviews
  public async getProductReviews(
    productId: string,
    query: { page?: string; limit?: string }
  ): Promise<{ reviews: IReview[]; total: number; page: number; pages: number }> {
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '5', 10);
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

    // Invalidate Cache
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
        await findChildren(child._id.toString()); // Recurse
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
