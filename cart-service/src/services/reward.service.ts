import crypto from 'crypto';
import { RewardProfile } from '../models/reward-profile.model';
import { Coupon, CouponDiscountType, ICoupon } from '../models/coupon.model';
import { BadRequestError } from '@shared/errors/app-error';

const NO_PRIZE = 'Try Again';
const REWARD_COUPON_VALID_DAYS = 30;

// Wheel slices in display order; the storefront draws the wheel from this list
export const SPIN_SEGMENTS = ['10% OFF', NO_PRIZE, 'Free Shipping', '20% OFF', NO_PRIZE, '5% OFF'];
export const SCRATCH_PRIZES = ['₹500 OFF', 'Free Shipping', '15% OFF', NO_PRIZE];

const PRIZE_COUPONS: Record<string, { discountType: CouponDiscountType; discountValue: number; minOrderValue: number }> = {
  '5% OFF': { discountType: CouponDiscountType.PERCENTAGE, discountValue: 5, minOrderValue: 0 },
  '10% OFF': { discountType: CouponDiscountType.PERCENTAGE, discountValue: 10, minOrderValue: 0 },
  '15% OFF': { discountType: CouponDiscountType.PERCENTAGE, discountValue: 15, minOrderValue: 0 },
  '20% OFF': { discountType: CouponDiscountType.PERCENTAGE, discountValue: 20, minOrderValue: 0 },
  '₹500 OFF': { discountType: CouponDiscountType.FIXED, discountValue: 500, minOrderValue: 2000 },
  'Free Shipping': { discountType: CouponDiscountType.FREE_SHIPPING, discountValue: 0, minOrderValue: 0 },
};

export interface IRewardCouponView {
  code: string;
  label: string;
  minOrderValue: number;
  expiryDate: Date;
  status: 'available' | 'used' | 'expired';
}

export interface IRewardSummary {
  hasPurchased: boolean;
  spinsAvailable: number;
  scratchCardsAvailable: number;
  coupons: IRewardCouponView[];
}

export interface IPlayResult {
  prize: string;
  segmentIndex: number;
  coupon: IRewardCouponView | null;
}

const startOfTodayUtc = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const toCouponView = (coupon: ICoupon): IRewardCouponView => ({
  code: coupon.code,
  label: coupon.label || coupon.code,
  minOrderValue: coupon.minOrderValue,
  expiryDate: coupon.expiryDate,
  status:
    coupon.usageCount >= coupon.usageLimit ? 'used' : new Date() > coupon.expiryDate ? 'expired' : 'available',
});

export class RewardService {
  public async getSummary(userId: string): Promise<IRewardSummary> {
    const [profile, coupons] = await Promise.all([
      RewardProfile.findOne({ user: userId }).exec(),
      Coupon.find({ assignedTo: userId }).sort({ createdAt: -1 }).limit(50).exec(),
    ]);

    const hasPurchased = !!profile && profile.purchases > 0;
    const spunToday = !!profile?.lastSpinAt && profile.lastSpinAt >= startOfTodayUtc();

    return {
      hasPurchased,
      spinsAvailable: hasPurchased && !spunToday ? 1 : 0,
      scratchCardsAvailable: profile?.scratchCardsAvailable ?? 0,
      coupons: coupons.map(toCouponView),
    };
  }

  // Daily spin, unlocked by the first purchase
  public async spin(userId: string): Promise<IPlayResult> {
    // Atomic claim of today's spin so concurrent requests can't spin twice
    const claimed = await RewardProfile.findOneAndUpdate(
      {
        user: userId,
        purchases: { $gt: 0 },
        $or: [{ lastSpinAt: { $exists: false } }, { lastSpinAt: { $lt: startOfTodayUtc() } }],
      },
      { $set: { lastSpinAt: new Date() } },
      { new: true }
    ).exec();

    if (!claimed) {
      throw new BadRequestError('No spin available. You can spin once a day after your first purchase.');
    }

    const segmentIndex = crypto.randomInt(SPIN_SEGMENTS.length);
    return this.awardPrize(userId, SPIN_SEGMENTS[segmentIndex], segmentIndex);
  }

  // Scratch card, one earned per order
  public async scratch(userId: string): Promise<IPlayResult> {
    const claimed = await RewardProfile.findOneAndUpdate(
      { user: userId, scratchCardsAvailable: { $gt: 0 } },
      { $inc: { scratchCardsAvailable: -1 } },
      { new: true }
    ).exec();

    if (!claimed) {
      throw new BadRequestError('No scratch cards available. You earn one with every order.');
    }

    const segmentIndex = crypto.randomInt(SCRATCH_PRIZES.length);
    return this.awardPrize(userId, SCRATCH_PRIZES[segmentIndex], segmentIndex);
  }

  // Called after a successful checkout
  public async recordPurchase(userId: string): Promise<void> {
    await RewardProfile.updateOne(
      { user: userId },
      { $inc: { purchases: 1, scratchCardsAvailable: 1 } },
      { upsert: true }
    ).exec();
  }

  private async awardPrize(userId: string, prize: string, segmentIndex: number): Promise<IPlayResult> {
    const spec = PRIZE_COUPONS[prize];
    if (!spec) {
      return { prize, segmentIndex, coupon: null };
    }

    const coupon = await Coupon.create({
      code: `LUXE-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      ...spec,
      label: prize,
      expiryDate: new Date(Date.now() + REWARD_COUPON_VALID_DAYS * 24 * 60 * 60 * 1000),
      usageLimit: 1,
      assignedTo: userId,
    });

    return { prize, segmentIndex, coupon: toCouponView(coupon) };
  }
}

export const rewardService = new RewardService();
export default rewardService;
