import { Router } from 'express';
import { requireInternalKey } from '@shared/middlewares/internal.middleware';
import categoryRouter from './category.routes';
import productRouter from './product.routes';
import dealRouter from './deal.routes';
import inventoryRouter from './inventory.routes';
import internalRouter from './internal.routes';

const router = Router();

// Public / Protected endpoints
router.use('/categories', categoryRouter);
router.use('/products', productRouter);
router.use('/deals', dealRouter);
router.use('/inventory', inventoryRouter);

// Internal microservice-to-microservice endpoints
router.use('/internal', requireInternalKey, internalRouter);

export default router;
