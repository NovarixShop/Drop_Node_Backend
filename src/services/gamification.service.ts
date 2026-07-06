import { GamificationProfile } from '../models/gamification.model';
import { BadRequestError } from '../errors/app-error';

export class GamificationService {
  public async getProfile(userId: string) {
    let profile = await GamificationProfile.findOne({ user: userId });
    
    // If no profile exists, create one with default values
    if (!profile) {
      profile = await GamificationProfile.create({ user: userId });
    }
    
    return profile;
  }

  public async useSpin(userId: string) {
    const profile = await this.getProfile(userId);

    if (profile.spinsAvailable <= 0) {
      throw new BadRequestError('No spins available');
    }

    profile.spinsAvailable -= 1;
    profile.lastSpinDate = new Date();
    await profile.save();

    return profile;
  }

  public async useScratchCard(userId: string) {
    const profile = await this.getProfile(userId);

    if (profile.scratchCardsAvailable <= 0) {
      throw new BadRequestError('No scratch cards available');
    }

    profile.scratchCardsAvailable -= 1;
    profile.lastScratchDate = new Date();
    await profile.save();

    return profile;
  }

  public async claimCoupon(userId: string, code: string) {
    const profile = await this.getProfile(userId);

    if (profile.couponsClaimed.includes(code)) {
      throw new BadRequestError('Coupon already claimed');
    }

    profile.couponsClaimed.push(code);
    await profile.save();

    return profile;
  }
}

export const gamificationService = new GamificationService();
