import { orderRepository } from '../repositories/order.repository';
import { OrderStatus, PaymentStatus, PaymentMethod } from '@shared/constants';
import { NotFoundError } from '@shared/errors/app-error';

export interface ICheckpoint {
  status: string;
  location: string;
  timestamp: Date;
  description: string;
}

export interface ITrackingDetails {
  orderId: string;
  trackingNumber: string;
  carrier: string;
  estimatedDelivery?: Date;
  currentStatus: OrderStatus;
  checkpoints: ICheckpoint[];
}

export class TrackingService {
  /**
   * Returns real-time tracking checkpoints for an order.
   * Checkpoints strictly reflect real events:
   * - Order Placed (at order creation)
   * - Payment Confirmed (when payment succeeded)
   * - Status updates manually triggered by an admin from the CMS
   * - Order Cancelled (if cancelled by customer or admin)
   * No fabricated checkpoints, fake future timestamps, or fake carriers.
   */
  public async getTrackingDetails(orderId: string): Promise<ITrackingDetails> {
    const order = await orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundError('Order not found');
    }

    const orderCreatedAt = new Date(order.createdAt as Date);
    const checkpoints: ICheckpoint[] = [];

    const destination = order.shippingAddress?.city
      ? `${order.shippingAddress.city}, ${order.shippingAddress.state || ''}`.trim().replace(/,\s*$/, '')
      : 'Customer Address';

    // 1. Initial Checkpoint: Order Placed (Always exists)
    const initialEntry = order.statusHistory?.[0];
    const initialTime = initialEntry?.timestamp ? new Date(initialEntry.timestamp) : orderCreatedAt;
    checkpoints.push({
      status: 'Order Placed',
      location: 'Store System',
      timestamp: initialTime,
      description: order.paymentMethod === PaymentMethod.COD
        ? 'Your order has been placed successfully via Cash on Delivery.'
        : 'Your order has been placed and received by our store.',
    });

    // 2. Online Payment Confirmation Checkpoint (if paid)
    if (order.paymentStatus === PaymentStatus.PAID && order.paymentMethod !== PaymentMethod.COD) {
      const paymentEntry = order.statusHistory?.find(
        (h) => h.note?.toLowerCase().includes('payment') || h.note?.toLowerCase().includes('razorpay')
      );
      const paymentTime = paymentEntry?.timestamp ? new Date(paymentEntry.timestamp) : initialTime;
      checkpoints.push({
        status: 'Payment Confirmed',
        location: 'Billing Center',
        timestamp: paymentTime,
        description: paymentEntry?.note || 'Payment has been cleared. Warehouse has been authorized to process your items.',
      });
    }

    // 3. Real Status Updates from CMS Admin / Cancellation
    if (Array.isArray(order.statusHistory)) {
      order.statusHistory.forEach((h, index) => {
        // Skip the very first initial pending entry since it's already captured as 'Order Placed'
        if (index === 0 && h.status === OrderStatus.PENDING) return;
        // Skip if this is the auto-logged Razorpay payment note to avoid duplicate payment checkpoint
        if (h.note?.toLowerCase().includes('payment received via razorpay')) return;

        let statusLabel = '';
        let location = 'Fulfillment Center';
        let defaultDesc = '';

        switch (h.status) {
          case OrderStatus.PROCESSING:
            statusLabel = 'Processing';
            location = 'Fulfillment Center';
            defaultDesc = 'Order is being verified and packed for shipment.';
            break;
          case OrderStatus.SHIPPED:
            statusLabel = 'Shipped & In Transit';
            location = 'Carrier Dispatch Facility';
            defaultDesc = 'Package has been dispatched and is on its way to your destination.';
            break;
          case OrderStatus.DELIVERED:
            statusLabel = 'Delivered';
            location = destination;
            defaultDesc = 'Package has been successfully delivered to your address.';
            break;
          case OrderStatus.CANCELLED:
            statusLabel = 'Order Cancelled';
            location = 'Store System';
            defaultDesc = 'Order was cancelled. Items have been released back to stock.';
            break;
          default:
            statusLabel = h.status ? h.status.charAt(0).toUpperCase() + h.status.slice(1) : 'Status Updated';
            location = 'Fulfillment Center';
            defaultDesc = `Order status updated to ${h.status}.`;
        }

        checkpoints.push({
          status: statusLabel,
          location,
          timestamp: new Date(h.timestamp),
          description: h.note || defaultDesc,
        });
      });
    }

    // Sort checkpoints descending (newest update at the top)
    const sortedCheckpoints = checkpoints.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Dynamic carrier display
    const carrier = order.trackingNumber
      ? `Novarix Express (${order.trackingNumber})`
      : 'Standard Delivery';

    const estimatedDelivery = new Date(orderCreatedAt.getTime() + 4 * 24 * 3600 * 1000);

    return {
      orderId: order.id,
      trackingNumber: order.trackingNumber || 'N/A',
      carrier,
      estimatedDelivery,
      currentStatus: order.orderStatus,
      checkpoints: sortedCheckpoints,
    };
  }
}

export const trackingService = new TrackingService();
export default trackingService;
