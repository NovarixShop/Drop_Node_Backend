import { Deal, IDeal } from '../models/deal.model';

export class DealRepository {
  // Find deal by ID
  public async findById(id: string): Promise<IDeal | null> {
    return Deal.findById(id).populate('products', 'name price slug images').exec();
  }

  // Create deal
  public async create(dealData: Partial<IDeal>): Promise<IDeal> {
    const deal = new Deal(dealData);
    return deal.save();
  }

  // Update deal
  public async update(id: string, updateData: Partial<IDeal>): Promise<IDeal | null> {
    return Deal.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).populate('products', 'name price slug images').exec();
  }

  // Delete deal
  public async delete(id: string): Promise<IDeal | null> {
    return Deal.findByIdAndDelete(id).exec();
  }

  // Find all active or scheduled deals based on current timestamp
  public async findActiveDeals(): Promise<IDeal[]> {
    const now = new Date();
    return Deal.find({
      isActive: true,
      endTime: { $gte: now }, // both active and scheduled have end time in the future
    })
      .populate('products', 'name price slug images compareAtPrice stock')
      .exec();
  }

  // Find all deals (including inactive / scheduled)
  public async findAll(): Promise<IDeal[]> {
    return Deal.find({}).sort({ startTime: -1 }).populate('products', 'name price slug').exec();
  }
}

export const dealRepository = new DealRepository();
export default dealRepository;
