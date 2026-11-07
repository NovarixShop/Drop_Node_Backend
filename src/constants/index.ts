export enum UserRole {
  CUSTOMER = 'customer',
  VENDOR = 'vendor',
  ADMIN = 'admin',
}

export enum OrderStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
}

export enum PaymentMethod {
  RAZORPAY = 'razorpay',
  COD = 'cod',
  /**
   * @deprecated Legacy values. The Stripe/PayPal mock was replaced by Razorpay; these
   * stay in the enum only so historical orders still validate when mongoose re-saves
   * them (e.g. a status change on an old order). Never assign them to a new order.
   */
  STRIPE = 'stripe',
  PAYPAL = 'paypal',
}

export enum NotificationType {
  ORDER = 'order',
  PAYMENT = 'payment',
  PROMO = 'promo',
  SYSTEM = 'system',
}

export enum AddressType {
  SHIPPING = 'shipping',
  BILLING = 'billing',
}
