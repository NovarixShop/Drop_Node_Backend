import { userRepository, UserRepository } from '../repositories/user.repository';
import { IUser } from '../models/user.model';
import { BadRequestError, UnauthorizedError } from '../errors/app-error';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/token';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/email';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { redisCache } from '../config/redis.config';
import { OAuth2Client } from 'google-auth-library';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export class AuthService {
  private userRepo: UserRepository;

  constructor(userRepo = userRepository) {
    this.userRepo = userRepo;
  }

  // Register a new user
  public async register(userData: Partial<IUser>): Promise<Omit<IUser, 'password'>> {
    const { name, email, password } = userData;

    if (!name || !email || !password) {
      throw new BadRequestError('Name, email, and password are required');
    }

    // Check if user already exists
    const existingUser = await this.userRepo.findByEmail(email);
    if (existingUser) {
      throw new BadRequestError('Email is already registered');
    }

    // Generate email verification token
    const verificationToken = uuidv4();

    // Create user in database
    const user = await this.userRepo.create({
      name,
      email,
      password,
      verificationToken,
      isVerified: false,
    });

    // Send email verification asynchronously (let it run, don't block registration response)
    sendVerificationEmail(user.email, user.name, verificationToken);

    // Convert mongoose document to object and remove password
    const userObj = user.toObject();
    delete userObj.password;

    return userObj;
  }

  // Login user
  public async login(email: string, password?: string): Promise<{
    user: Omit<IUser, 'password'>;
    accessToken: string;
    refreshToken: string;
  }> {
    if (!email || !password) {
      throw new BadRequestError('Email and password are required');
    }

    // Find user and explicitly select password and refresh token
    const user = await this.userRepo.findByEmail(email, '+password +refreshToken');
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Check password
    const isPasswordCorrect = await user.comparePassword(password);
    if (!isPasswordCorrect) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Check if email is verified
    if (!user.isVerified) {
      throw new UnauthorizedError('Please verify your email address first');
    }

    // Generate tokens
    const payload = { userId: user.id, role: user.role };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Save refresh token in database
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

  // Google Login
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
      role: 'admin',
      isVerified: true,
    });

    const userObj = user.toObject();
    delete userObj.password;

    return userObj;
  }

  // Refresh access token
  public async refresh(token: string): Promise<{ accessToken: string }> {
    if (!token) {
      throw new UnauthorizedError('Refresh token is required');
    }

    try {
      // Verify refresh token signature
      const decoded = verifyRefreshToken(token);

      // Check if token is blacklisted in Redis
      const isBlacklisted = await redisCache.get(`blacklist:${token}`);
      if (isBlacklisted) {
        throw new UnauthorizedError('Token has been revoked');
      }

      // Find user with matching refresh token
      const user = await this.userRepo.findOne({
        _id: decoded.userId,
        refreshToken: token,
      });

      if (!user) {
        throw new UnauthorizedError('Invalid or expired refresh token');
      }

      // Generate new access token
      const accessToken = generateAccessToken({ userId: user.id, role: user.role });

      return { accessToken };
    } catch (error) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
  }

  // Logout user
  public async logout(userId: string, refreshToken?: string): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (user) {
      user.refreshToken = undefined;
      await user.save();
    }

    // If refresh token is provided, blacklist it in Redis for security (expires in 7 days)
    if (refreshToken) {
      await redisCache.set(`blacklist:${refreshToken}`, 'true', 7 * 24 * 60 * 60);
    }
  }

  // Verify email
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

  // Send password reset request
  public async forgotPassword(email: string): Promise<void> {
    if (!email) {
      throw new BadRequestError('Email is required');
    }

    const user = await this.userRepo.findByEmail(email);
    // For security, don't leak whether the email exists. 
    // Just return success even if user not found.
    if (!user) return;

    // Generate reset token and expiry (1 hour)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
    await user.save();

    // Send password reset email
    await sendPasswordResetEmail(user.email, user.name, resetToken);
  }

  // Reset password
  public async resetPassword(token: string, password?: string): Promise<void> {
    if (!token || !password) {
      throw new BadRequestError('Token and new password are required');
    }

    if (password.length < 6) {
      throw new BadRequestError('Password must be at least 6 characters');
    }

    // Hash the incoming token to match database
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with matching token and unexpired time
    const user = await this.userRepo.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      throw new BadRequestError('Invalid or expired reset token');
    }

    // Update password and clear reset fields
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.refreshToken = undefined; // Force logout on all devices
    await user.save();
  }
}

export const authService = new AuthService();
export default authService;
