import { Order, IOrder } from '../models/order.model';
import { FilterQuery } from 'mongoose';

export class OrderRepository {
  // Find order by ID
  public async findById(id: string): Promise<IOrder | null> {
    return Order.findById(id).exec();
  }

  // Create an order
  public async create(orderData: Partial<IOrder>): Promise<IOrder> {
    const order = new Order(orderData);
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
        .exec(),
      Order.countDocuments(filter).exec(),
    ]);

    return { orders, total };
  }

  // Update order status or details
  // Razorpay webhooks identify an order only by the gateway order id we stored at
  // checkout, so the reconciliation path needs this lookup.
  public async findByRazorpayOrderId(razorpayOrderId: string): Promise<IOrder | null> {
    return Order.findOne({ 'paymentDetails.razorpayOrderId': razorpayOrderId }).exec();
  }

  public async update(id: string, updateData: Partial<IOrder>): Promise<IOrder | null> {
    return Order.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).exec();
  }
}

export const orderRepository = new OrderRepository();
export default orderRepository;
