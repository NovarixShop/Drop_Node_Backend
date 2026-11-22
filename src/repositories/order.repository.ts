import { Order, IOrder } from '../models/order.model';
import { FilterQuery, ClientSession } from 'mongoose';

export class OrderRepository {
  // Find order by ID and populate user details
  public async findById(id: string): Promise<IOrder | null> {
    return Order.findById(id)
      .populate('user', 'name email phone')
      .populate('items.product', 'name slug images')
      .exec();
  }

  // Create an order (accepts an optional session for transactions!)
  public async create(orderData: Partial<IOrder>, session?: ClientSession): Promise<IOrder> {
    const order = new Order(orderData);
    if (session) {
      const saved = await order.save({ session });
      return saved;
    }
    return order.save();
  }

  // Find user orders with pagination
  public async findAndCount(
    filter: FilterQuery<IOrder>,
    skip = 0,
    limit = 10
  ): Promise<{ orders: IOrder[]; total: number }> {
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user', 'name email phone')
        .exec(),
      Order.countDocuments(filter).exec(),
    ]);

    return { orders, total };
  }

  // Update order status or details
  public async update(id: string, updateData: Partial<IOrder>): Promise<IOrder | null> {
    return Order.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).exec();
  }
}

export const orderRepository = new OrderRepository();
export default orderRepository;
