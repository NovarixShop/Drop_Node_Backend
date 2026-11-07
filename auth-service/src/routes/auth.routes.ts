import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import { UserRole } from '@shared/constants';
import rateLimit from 'express-rate-limit';

const router = Router();

// Credential endpoints get a much tighter budget than the service-wide limiter to slow down
// password guessing, credential stuffing and email-bombing via the register/forgot-password forms.
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many attempts. Please try again in 15 minutes.' },
});

// Public auth routes
router.post('/register', credentialLimiter, authController.register.bind(authController));
router.post('/login', credentialLimiter, authController.login.bind(authController));
router.post('/google-login', credentialLimiter, authController.googleLogin.bind(authController));
router.post('/refresh', authController.refresh.bind(authController));
router.get('/verify-email', authController.verifyEmail.bind(authController));
router.post('/verify-email', authController.verifyEmail.bind(authController));
router.post('/forgot-password', credentialLimiter, authController.forgotPassword.bind(authController));
router.post('/reset-password', credentialLimiter, authController.resetPassword.bind(authController));

// Protected auth routes
router.post('/logout', protect, authController.logout.bind(authController));
router.post('/register-admin', protect, restrictTo(UserRole.ADMIN), authController.registerAdmin.bind(authController));

export default router;
