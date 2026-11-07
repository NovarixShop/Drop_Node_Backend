import { Router } from 'express';
import { requireInternalKey } from '@shared/middlewares/internal.middleware';
import blogRouter from './blog.routes';
import cmsRouter from './cms.routes';
import internalRouter from './internal.routes';

const router = Router();

// Mount individual module routers
router.use('/blogs', blogRouter);
router.use('/cms', cmsRouter);

// Internal microservice-to-microservice endpoints (key-protected, blocked at the gateway)
router.use('/internal', requireInternalKey, internalRouter);

export default router;
