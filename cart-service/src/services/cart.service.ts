import { cartRepository, CartRepository } from '../repositories/cart.repository';
import { couponRepository } from '../repositories/coupon.repository';
import { catalogClient, ICatalogProduct } from '../utils/catalog-client';
import { ICart } from '../models/cart.model';
import { BadRequestError, NotFoundError } from '@shared/errors/app-error';
import { CouponDiscountType } from '../models/coupon.model';
import { logger } from '@shared/utils/logger';

export class CartService {
  private cartRepo: CartRepository;

  constructor(cartRepo = cartRepository) {
    this.cartRepo = cartRepo;
  }

  // Get user cart and populate product details in-memory with fresh pricing
  public async getCart(userId: string): Promise<any> {
    const cart = await this.cartRepo.getOrCreateCart(userId);
    if (cart.items.length > 0) {
      await this.recalculateTotals(cart);
      await this.cartRepo.save(cart);
    }
    return this.populateCartProducts(cart);
  }

  // Add item to cart
  public async addToCart(userId: string, productId: string, quantity = 1): Promise<any> {
    const cart = await this.cartRepo.getOrCreateCart(userId);
    
    // Fetch product details from Catalog Service
    const product = await catalogClient.getProductById(productId);
    if (!product || !product.isActive) {
      throw new NotFoundError('Product not found or inactive');
    }

    if (product.stock < quantity) {
      throw new BadRequestError(`Insufficient stock. Only ${product.stock} units available.`);
    }

    // Check if product is already in cart
    const itemIndex = cart.items.findIndex(
      (item) => item.product.toString() === productId
    );

    if (itemIndex > -1) {
      const newQuantity = cart.items[itemIndex].quantity + quantity;
      if (product.stock < newQuantity) {
        throw new BadRequestError(`Insufficient stock. Cannot add more of this item. Max available is ${product.stock}.`);
      }
      cart.items[itemIndex].quantity = newQuantity;
    } else {
      cart.items.push({ product: productId as any, quantity });
    }

    await this.recalculateTotals(cart);
    const savedCart = await this.cartRepo.save(cart);
    return this.populateCartProducts(savedCart);
  }

  // Update cart item quantity
  public async updateQuantity(userId: string, productId: string, quantity: number): Promise<any> {
    if (quantity < 1) {
      return this.removeFromCart(userId, productId);
    }

    const cart = await this.cartRepo.getOrCreateCart(userId);
    const product = await catalogClient.getProductById(productId);

    if (!product || !product.isActive) {
      throw new NotFoundError('Product not found or inactive');
    }

    if (product.stock < quantity) {
      throw new BadRequestError(`Insufficient stock. Only ${product.stock} units available.`);
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.product.toString() === productId
    );

    if (itemIndex === -1) {
      throw new NotFoundError('Product not found in cart');
    }

    cart.items[itemIndex].quantity = quantity;

    await this.recalculateTotals(cart);
    const savedCart = await this.cartRepo.save(cart);
    return this.populateCartProducts(savedCart);
  }

  // Remove item from cart
  public async removeFromCart(userId: string, productId: string): Promise<any> {
    const cart = await this.cartRepo.getOrCreateCart(userId);

    cart.items = cart.items.filter(
      (item) => item.product.toString() !== productId
    );

    await this.recalculateTotals(cart);
    const savedCart = await this.cartRepo.save(cart);
    return this.populateCartProducts(savedCart);
  }

  // Apply coupon code
  public async applyCoupon(userId: string, code: string): Promise<any> {
    const cart = await this.cartRepo.getOrCreateCart(userId);
    if (cart.items.length === 0) {
      throw new BadRequestError('Cannot apply coupon to an empty cart');
    }

    const coupon = await couponRepository.findByCode(code);
    if (!coupon || (coupon.assignedTo && coupon.assignedTo !== userId)) {
      throw new NotFoundError('Coupon code is invalid');
    }

    // Calculate temporary subtotal using fresh catalog prices to validate coupon
    const productIds = cart.items.map((item: any) => item.product.toString());
    const products = await catalogClient.getProductsInBulk(productIds);
    const productMap = new Map<string, ICatalogProduct>();
    products.forEach(p => productMap.set(p._id.toString(), p));

    let tempSubtotal = 0;
    cart.items.forEach((item: any) => {
      const prodId = item.product.toString();
      const product = productMap.get(prodId);
      if (product && product.isActive) {
        tempSubtotal += product.price * item.quantity;
      }
    });

    if (!coupon.isValid(tempSubtotal)) {
      throw new BadRequestError('Coupon is expired, fully used, or minimum order value not met');
    }

    cart.couponCode = coupon.code;
    await this.recalculateTotals(cart);
    const savedCart = await this.cartRepo.save(cart);
    return this.populateCartProducts(savedCart);
  }

  // Remove coupon code
  public async removeCoupon(userId: string): Promise<any> {
    const cart = await this.cartRepo.getOrCreateCart(userId);
    cart.couponCode = null;
    await this.recalculateTotals(cart);
    const savedCart = await this.cartRepo.save(cart);
    return this.populateCartProducts(savedCart);
  }

  // Recalculate all cart totals
  public async recalculateTotals(cart: ICart): Promise<void> {
    let subtotal = 0;
    let totalTax = 0;
    let totalShipping = 0;

    const productIds = cart.items.map((item: any) => item.product.toString());
    if (productIds.length > 0) {
      // Let catalog failures propagate: falling back to 0 would save a zeroed cart and drop the user's coupon
      const products = await catalogClient.getProductsInBulk(productIds);
      const productMap = new Map<string, ICatalogProduct>();
      products.forEach(p => productMap.set(p._id.toString(), p));

      cart.items.forEach((item: any) => {
        const prodId = item.product.toString();
        const product = productMap.get(prodId);
        if (product && product.isActive) {
          subtotal += product.price * item.quantity;
          if (product.tax && product.tax > 0) {
            totalTax += product.tax * item.quantity;
          }
          if (product.shippingCost && product.shippingCost > 0) {
            totalShipping += product.shippingCost;
          }
        }
      });
    }

    let discount = 0;

    if (cart.couponCode) {
      const coupon = await couponRepository.findByCode(cart.couponCode);
      if (coupon && coupon.isValid(subtotal)) {
        if (coupon.discountType === CouponDiscountType.PERCENTAGE) {
          discount = subtotal * (coupon.discountValue / 100);
        } else if (coupon.discountType === CouponDiscountType.FIXED) {
          discount = coupon.discountValue;
        }
        discount = Math.min(discount, subtotal);
      } else {
        cart.couponCode = null;
      }
    }

    const netAmount = Math.max(0, subtotal - discount);
    const grandTotal = Math.round((netAmount + totalTax + totalShipping) * 100) / 100;

    cart.totals = {
      subtotal: Math.round(subtotal * 100) / 100,
      discount: Math.round(discount * 100) / 100,
      tax: Math.round(totalTax * 100) / 100,
      shipping: Math.round(totalShipping * 100) / 100,
      grandTotal,
    };
  }

  // Helper to populate product details in-memory for a Cart document
  public async populateCartProducts(cart: ICart): Promise<any> {
    const cartObj = cart.toObject();
    const productIds = cartObj.items.map((item: any) => item.product.toString());
    if (productIds.length === 0) {
      cartObj.isCodAvailable = true;
      return cartObj;
    }

    try {
      const products = await catalogClient.getProductsInBulk(productIds);
      const productMap = new Map<string, ICatalogProduct>();
      products.forEach(p => productMap.set(p._id.toString(), p));

      let allCodAvailable = true;
      cartObj.items.forEach((item: any) => {
        const prodId = item.product.toString();
        const p = productMap.get(prodId);
        if (p) {
          item.product = p;
          if (p.isCodAvailable === false) {
            allCodAvailable = false;
          }
        } else {
          item.product = {
            _id: prodId,
            name: 'Unknown Product',
            price: 0,
            stock: 0,
            images: [],
            isActive: false,
            tax: 0,
            shippingCost: 0,
            isCodAvailable: true,
          };
        }
      });
      cartObj.isCodAvailable = allCodAvailable;
    } catch (err) {
      logger.error('Failed to populate cart products via REST', err);
      cartObj.isCodAvailable = true;
    }

    return cartObj;
  }
}

export const cartService = new CartService();
export default cartService;
