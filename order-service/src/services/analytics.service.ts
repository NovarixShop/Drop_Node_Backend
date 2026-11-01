import { Order } from '../models/order.model';
import { PaymentStatus, OrderStatus } from '@shared/constants';
import { countActiveProducts, countCustomers } from '../utils/clients';

export interface IDashboardStats {
  totals: {
    revenue: number;
    orders: number;
    products: number;
    customers: number;
  };
  salesTrend: { _id: string; totalSales: number; count: number }[];
  topProducts: { name: string; quantity: number; revenue: number }[];
  orderStatuses: { _id: string; count: number }[];
}

export class AnalyticsService {
  // Get main administrative dashboard metrics
  public async getDashboardStats(): Promise<IDashboardStats> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // 1. Calculate Totals
    const [revenueStats, ordersCount, productsCount, customersCount] = await Promise.all([
      // Total Revenue
      Order.aggregate([
        {
          $match: {
            paymentStatus: PaymentStatus.PAID,
            orderStatus: { $ne: OrderStatus.CANCELLED },
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totals.grandTotal' },
          },
        },
      ]).exec(),
      // Total Orders
      Order.countDocuments({}).exec(),
      // Total Products (Catalog Service)
      countActiveProducts(),
      // Total Customers (Auth Service)
      countCustomers(),
    ]);

    const totalRevenue = revenueStats.length > 0 ? Math.round(revenueStats[0].totalRevenue * 100) / 100 : 0;

    // 2. Sales Trend (Last 30 Days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const salesTrend = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
          paymentStatus: PaymentStatus.PAID,
          orderStatus: { $ne: OrderStatus.CANCELLED },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          totalSales: { $sum: '$totals.grandTotal' },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]).exec();

    // Round sales figures in trend
    const formattedSalesTrend = salesTrend.map((item) => ({
      _id: item._id,
      totalSales: Math.round(item.totalSales * 100) / 100,
      count: item.count,
    }));

    // 3. Top 5 Selling Products
    const topProducts = await Order.aggregate([
      {
        $match: {
          paymentStatus: PaymentStatus.PAID,
          orderStatus: { $ne: OrderStatus.CANCELLED },
        },
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          quantity: { $sum: '$items.quantity' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        },
      },
      { $sort: { quantity: -1 } },
      { $limit: 5 },
    ]).exec();

    const formattedTopProducts = topProducts.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      revenue: Math.round(item.revenue * 100) / 100,
    }));

    // 4. Order Status distribution
    const orderStatuses = await Order.aggregate([
      {
        $group: {
          _id: '$orderStatus',
          count: { $sum: 1 },
        },
      },
    ]).exec();

    return {
      totals: {
        revenue: totalRevenue,
        orders: ordersCount,
        products: productsCount,
        customers: customersCount,
      },
      salesTrend: formattedSalesTrend,
      topProducts: formattedTopProducts,
      orderStatuses,
    };
  }
}

export const analyticsService = new AnalyticsService();
export default analyticsService;
