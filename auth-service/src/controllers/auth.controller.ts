import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { z } from 'zod';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50),
  email: z.string().email('Please provide a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password cannot exceed 128 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Please provide a valid email address'),
  password: z.string().min(1, 'Password is required').max(128, 'Password cannot exceed 128 characters'),
});

const googleLoginSchema = z.object({
  idToken: z.string().min(1, 'ID Token is required'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Please provide a valid email address'),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password cannot exceed 128 characters'),
});

export class AuthController {
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

  public async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedBody = loginSchema.parse(req.body);
      const { user, accessToken, refreshToken } = await authService.login(
        validatedBody.email,
        validatedBody.password
      );

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
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

  public async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
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

  public async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const token = req.body.refreshToken || req.cookies?.refreshToken;

      if (userId) {
        await authService.logout(userId, token);
      }

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

  public async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // GET from the emailed link carries the token in the query; POST may send it in the body
      const token = req.query.token || req.body?.token;
      await authService.verifyEmail(token as string);

      res.status(200).json({
        status: 'success',
        message: 'Email verified successfully. You can now log in.',
      });
    } catch (error) {
      next(error);
    }
  }

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
