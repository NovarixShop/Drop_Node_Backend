import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import { UserRole } from '@shared/constants';

const router = Router();

// Public auth routes
router.post('/register', authController.register.bind(authController));
router.post('/login', authController.login.bind(authController));
router.post('/google-login', authController.googleLogin.bind(authController));
router.post('/refresh', authController.refresh.bind(authController));
router.get('/verify-email', authController.verifyEmail.bind(authController));
router.post('/verify-email', authController.verifyEmail.bind(authController));
router.post('/forgot-password', authController.forgotPassword.bind(authController));
router.post('/reset-password', authController.resetPassword.bind(authController));

// Protected auth routes
router.post('/logout', protect, authController.logout.bind(authController));
router.post('/register-admin', protect, restrictTo(UserRole.ADMIN), authController.registerAdmin.bind(authController));

export default router;
