import { Schema, model, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { UserRole, AddressType } from '@shared/constants';

export interface IAddress {
  _id?: any;
  id?: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  type: AddressType;
  isDefault: boolean;
}

export interface IUser extends Document {
  createdAt: Date;
  updatedAt: Date;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  isVerified: boolean;
  verificationToken?: string;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  refreshToken?: string;
  addresses: IAddress[];
  comparePassword(password: string): Promise<boolean>;
}

const AddressSchema = new Schema<IAddress>({
  street: { type: String, required: true, trim: true },
  city: { type: String, required: true, trim: true },
  state: { type: String, required: true, trim: true },
  postalCode: { type: String, required: true, trim: true },
  country: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: Object.values(AddressType),
    default: AddressType.SHIPPING,
  },
  isDefault: { type: Boolean, default: false },
});

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
      maxlength: [50, 'Name cannot exceed 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Please provide an email'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email',
      ],
      index: true,
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.CUSTOMER,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: {
      type: String,
      select: false,
    },
    resetPasswordToken: {
      type: String,
      select: false,
    },
    resetPasswordExpires: {
      type: Date,
      select: false,
    },
    refreshToken: {
      type: String,
      select: false,
    },
    addresses: [AddressSchema],
  },
  {
    timestamps: true,
    validateModifiedOnly: true,
  }
);

// Hash password before saving
UserSchema.pre<IUser>('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password!, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Compare password instance method
UserSchema.methods.comparePassword = async function (password: string): Promise<boolean> {
  return bcrypt.compare(password, this.password || '');
};

export const User = model<IUser>('User', UserSchema);
export default User;
