import { Router } from 'express';
import { productController } from '../controllers/product.controller';
import { protect, restrictTo } from '@shared/middlewares/auth.middleware';
import { UserRole } from '@shared/constants';

const router = Router();

// Public: Browse products and reviews
router.get('/', productController.getProducts.bind(productController));
router.get('/slug/:slug', productController.getBySlug.bind(productController));
router.get('/:id/reviews', productController.getReviews.bind(productController));
router.get('/:id/similar', productController.getSimilar.bind(productController));

// Protected: Customer submitting reviews
router.post('/:id/reviews', protect, productController.submitReview.bind(productController));

// Admin/Vendor: Manage products
router.get(
  '/:id',
  protect,
  restrictTo(UserRole.ADMIN, UserRole.VENDOR),
  productController.getById.bind(productController)
);
router.post(
  '/',
  protect,
  restrictTo(UserRole.ADMIN, UserRole.VENDOR),
  productController.create.bind(productController)
);
router.put(
  '/:id',
  protect,
  restrictTo(UserRole.ADMIN, UserRole.VENDOR),
  productController.update.bind(productController)
);
router.delete(
  '/:id',
  protect,
  restrictTo(UserRole.ADMIN, UserRole.VENDOR),
  productController.delete.bind(productController)
);

export default router;
