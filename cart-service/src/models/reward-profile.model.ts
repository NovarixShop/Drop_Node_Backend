import { Schema, model, Document } from 'mongoose';

export interface IRewardProfile extends Document {
  user: string;
  purchases: number;
  scratchCardsAvailable: number;
  lastSpinAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Play allowances live on the server so they can't be edited in the browser to mint coupons
const RewardProfileSchema = new Schema<IRewardProfile>(
  {
    user: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    purchases: {
      type: Number,
      default: 0,
      min: 0,
    },
    scratchCardsAvailable: {
      type: Number,
      default: 0,
      min: [0, 'Scratch cards cannot be negative'],
    },
    lastSpinAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

export const RewardProfile = model<IRewardProfile>('RewardProfile', RewardProfileSchema);
export default RewardProfile;
