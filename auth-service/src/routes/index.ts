import { Router } from 'express';
import authRouter from './auth.routes';
import userRouter from './user.routes';
import internalRouter from './internal.routes';

const router = Router();

// Mount individual module routers
router.use('/auth', authRouter);
router.use('/users', userRouter);

// Internal microservice-to-microservice endpoints
router.use('/internal', internalRouter);

export default router;
