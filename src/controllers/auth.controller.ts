import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { z } from 'zod';

// Zod schemas for body validation
const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50),
  email: z.string().email('Please provide a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const googleLoginSchema = z.object({
  idToken: z.string().min(1, 'ID Token is required'),
});

const loginSchema = z.object({
  email: z.string().email('Please provide a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Please provide a valid email address'),
});

const resetPasswordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export class AuthController {
  // Register a new user
  public async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedBody = registerSchema.parse(req.body);
      const user = await authService.register(validatedBody);
      
      res.status(201).json({
        status: 'success',
        message: 'Registration successful. Please check your email to verify your account.',
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  // Login user
  public async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedBody = loginSchema.parse(req.body);
      const { user, accessToken, refreshToken } = await authService.login(
        validatedBody.email,
        validatedBody.password
      );

      // Store refresh token in secure, HTTP-only cookie
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.status(200).json({
        status: 'success',
        message: 'Login successful',
        data: {
          user,
          accessToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Google Login
  public async googleLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedBody = googleLoginSchema.parse(req.body);
      const { user, accessToken, refreshToken } = await authService.googleLogin(validatedBody.idToken);

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(200).json({
        status: 'success',
        message: 'Google login successful',
        data: { user, accessToken },
      });
    } catch (error) {
      next(error);
    }
  }

  // Register Admin
  public async registerAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedBody = registerSchema.parse(req.body);
      const user = await authService.registerAdmin(validatedBody);
      
      res.status(201).json({
        status: 'success',
        message: 'Admin created successfully.',
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  // Refresh access token
  public async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Try to get token from body or cookie
      const token = req.body.refreshToken || req.cookies?.refreshToken;
      const { accessToken } = await authService.refresh(token);

      res.status(200).json({
        status: 'success',
        data: { accessToken },
      });
    } catch (error) {
      next(error);
    }
  }

  // Logout user
  public async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const token = req.body.refreshToken || req.cookies?.refreshToken;

      if (userId) {
        await authService.logout(userId, token);
      }

      // Clear cookie
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      });

      res.status(200).json({
        status: 'success',
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // Verify Email
  public async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.query;
      await authService.verifyEmail(token as string);

      res.status(200).json({
        status: 'success',
        message: 'Email verified successfully. You can now log in.',
      });
    } catch (error) {
      next(error);
    }
  }

  // Forgot password request
  public async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedBody = forgotPasswordSchema.parse(req.body);
      await authService.forgotPassword(validatedBody.email);

      res.status(200).json({
        status: 'success',
        message: 'If your email is registered, you will receive a password reset link shortly.',
      });
    } catch (error) {
      next(error);
    }
  }

  // Reset password using token
  public async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.query;
      const validatedBody = resetPasswordSchema.parse(req.body);
      
      await authService.resetPassword(token as string, validatedBody.password);

      res.status(200).json({
        status: 'success',
        message: 'Password reset successful. You can now log in with your new password.',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
export default authController;
