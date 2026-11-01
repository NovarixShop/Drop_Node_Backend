import { Schema, model, Document } from 'mongoose';

export enum CouponDiscountType {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
  FREE_SHIPPING = 'free_shipping',
}

export interface ICoupon extends Document {
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  minOrderValue: number;
  expiryDate: Date;
  usageLimit: number;
  usageCount: number;
  active: boolean;
  // Reward coupons belong to the user who won them; admin coupons leave this unset
  assignedTo?: string;
  label?: string;
  isValid(orderAmount: number): boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CouponSchema = new Schema<ICoupon>(
  {
    code: {
      type: String,
      required: [true, 'Coupon code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    discountType: {
      type: String,
      enum: Object.values(CouponDiscountType),
      required: [true, 'Discount type is required'],
    },
    discountValue: {
      type: Number,
      required: [true, 'Discount value is required'],
      min: [0, 'Discount value cannot be negative'],
    },
    minOrderValue: {
      type: Number,
      default: 0,
      min: [0, 'Minimum order value cannot be negative'],
    },
    expiryDate: {
      type: Date,
      required: [true, 'Coupon expiry date is required'],
    },
    usageLimit: {
      type: Number,
      required: [true, 'Usage limit is required'],
      min: [1, 'Usage limit must be at least 1'],
    },
    usageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    active: {
      type: Boolean,
      default: true,
    },
    assignedTo: {
      type: String,
      index: true,
    },
    label: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

CouponSchema.methods.isValid = function (orderAmount: number): boolean {
  if (!this.active) return false;
  if (this.usageCount >= this.usageLimit) return false;
  if (new Date() > this.expiryDate) return false;
  if (orderAmount < this.minOrderValue) return false;
  return true;
};

export const Coupon = model<ICoupon>('Coupon', CouponSchema);
export default Coupon;
