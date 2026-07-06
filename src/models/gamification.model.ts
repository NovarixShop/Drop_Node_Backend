import { Schema, model, Document } from 'mongoose';

export interface IGamificationProfile extends Document {
  user: Schema.Types.ObjectId;
  spinsAvailable: number;
  scratchCardsAvailable: number;
  couponsClaimed: string[];
  lastSpinDate?: Date;
  lastScratchDate?: Date;
}

const GamificationProfileSchema = new Schema<IGamificationProfile>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // One profile per user
      index: true,
    },
    spinsAvailable: {
      type: Number,
      default: 1,
      min: [0, 'Spins cannot be negative'],
    },
    scratchCardsAvailable: {
      type: Number,
      default: 3,
      min: [0, 'Scratch cards cannot be negative'],
    },
    couponsClaimed: [
      {
        type: String,
        trim: true,
      }
    ],
    lastSpinDate: {
      type: Date,
    },
    lastScratchDate: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

export const GamificationProfile = model<IGamificationProfile>('GamificationProfile', GamificationProfileSchema);
export default GamificationProfile;
