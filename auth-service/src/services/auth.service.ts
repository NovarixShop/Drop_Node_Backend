import { userRepository, UserRepository } from '../repositories/user.repository';
import { IUser } from '../models/user.model';
import { BadRequestError, UnauthorizedError } from '@shared/errors/app-error';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '@shared/utils/token';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/email';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { UserRole } from '@shared/constants';
import { redisCache } from '../config/redis.config';
import { OAuth2Client } from 'google-auth-library';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export class AuthService {
  private userRepo: UserRepository;

  constructor(userRepo = userRepository) {
    this.userRepo = userRepo;
  }

  public async register(userData: Partial<IUser>): Promise<Omit<IUser, 'password'>> {
    const { name, email, password } = userData;

    if (!name || !email || !password) {
      throw new BadRequestError('Name, email, and password are required');
    }

    const existingUser = await this.userRepo.findByEmail(email);
    if (existingUser) {
      throw new BadRequestError('Email is already registered');
    }

    const verificationToken = uuidv4();

    const user = await this.userRepo.create({
      name,
      email,
      password,
      verificationToken,
      isVerified: false,
    });

    sendVerificationEmail(user.email, user.name, verificationToken);

    const userObj = user.toObject();
    delete userObj.password;

    return userObj;
  }

  // Register Admin (only callable by existing admin)
  public async registerAdmin(userData: Partial<IUser>): Promise<Omit<IUser, 'password'>> {
    const { name, email, password } = userData;

    if (!name || !email || !password) {
      throw new BadRequestError('Name, email, and password are required');
    }

    const existingUser = await this.userRepo.findByEmail(email);
    if (existingUser) {
      throw new BadRequestError('Email is already registered');
    }

    const user = await this.userRepo.create({
      name,
      email,
      password,
      role: UserRole.ADMIN,
      isVerified: true,
    });

    const userObj = user.toObject();
    delete userObj.password;

    return userObj;
  }

  public async login(email: string, password?: string): Promise<{
    user: Omit<IUser, 'password'>;
    accessToken: string;
    refreshToken: string;
  }> {
    if (!email || !password) {
      throw new BadRequestError('Email and password are required');
    }

    const user = await this.userRepo.findByEmail(email, '+password +refreshToken');
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isPasswordCorrect = await user.comparePassword(password);
    if (!isPasswordCorrect) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!user.isVerified) {
      throw new UnauthorizedError('Please verify your email address first');
    }

    const payload = { userId: user.id, role: user.role };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    user.refreshToken = refreshToken;
    await user.save();

    const userObj = user.toObject();
    delete userObj.password;
    delete userObj.refreshToken;

    return {
      user: userObj,
      accessToken,
      refreshToken,
    };
  }

  public async googleLogin(idToken: string): Promise<{
    user: Omit<IUser, 'password'>;
    accessToken: string;
    refreshToken: string;
  }> {
    if (!idToken) throw new BadRequestError('ID Token is required');

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new UnauthorizedError('Invalid Google Token');
    }

    // A Google account can carry an email address its owner never proved they control.
    // Linking on such an email would let anyone sign in to an existing account here.
    if (payload.email_verified !== true) {
      throw new UnauthorizedError('Your Google email address is not verified.');
    }

    const { email, name } = payload;
    let user = await this.userRepo.findByEmail(email, '+refreshToken');
    
    if (!user) {
      // Create user if not exists
      user = await this.userRepo.create({
        name: name || 'Google User',
        email,
        isVerified: true, // Google emails are already verified
        password: crypto.randomBytes(32).toString('hex'), // Random password for oauth users
      });
    }

    // Generate tokens
    const tokenPayload = { userId: user.id, role: user.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Save refresh token
    user.refreshToken = refreshToken;
    await user.save();

    const userObj = user.toObject();
    delete userObj.password;
    delete userObj.refreshToken;

    return { user: userObj, accessToken, refreshToken };
  }

  public async refresh(token: string): Promise<{ accessToken: string }> {
    if (!token) {
      throw new UnauthorizedError('Refresh token is required');
    }

    try {
      const decoded = verifyRefreshToken(token);

      const isBlacklisted = await redisCache.get(`blacklist:${token}`);
      if (isBlacklisted) {
        throw new UnauthorizedError('Token has been revoked');
      }

      const user = await this.userRepo.findOne({
        _id: decoded.userId,
        refreshToken: token,
      });

      if (!user) {
        throw new UnauthorizedError('Invalid or expired refresh token');
      }

      const accessToken = generateAccessToken({ userId: user.id, role: user.role });

      return { accessToken };
    } catch (error) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
  }

  public async logout(userId: string, refreshToken?: string): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (user) {
      user.refreshToken = undefined;
      await user.save();
    }

    if (refreshToken) {
      await redisCache.set(`blacklist:${refreshToken}`, 'true', 7 * 24 * 60 * 60);
    }
  }

  public async verifyEmail(token: string): Promise<void> {
    if (!token) {
      throw new BadRequestError('Verification token is required');
    }

    const user = await this.userRepo.findOne({ verificationToken: token });
    if (!user) {
      throw new BadRequestError('Invalid or expired verification token');
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();
  }

  public async forgotPassword(email: string): Promise<void> {
    if (!email) {
      throw new BadRequestError('Email is required');
    }

    const user = await this.userRepo.findByEmail(email);
    if (!user) return;

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
    await user.save();

    await sendPasswordResetEmail(user.email, user.name, resetToken);
  }

  public async resetPassword(token: string, password?: string): Promise<void> {
    if (!token || !password) {
      throw new BadRequestError('Token and new password are required');
    }

    if (password.length < 8 || password.length > 128) {
      throw new BadRequestError('Password must be between 8 and 128 characters');
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await this.userRepo.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      throw new BadRequestError('Invalid or expired reset token');
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.refreshToken = undefined; // Force logout
    await user.save();
  }
}

export const authService = new AuthService();
export default authService;
