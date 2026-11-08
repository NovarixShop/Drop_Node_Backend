import mongoose, { Schema, model, Document } from 'mongoose';
import { OrderStatus, PaymentStatus, PaymentMethod } from '@shared/constants';

// Register lightweight User schema for population across microservices sharing the database
if (!mongoose.models.User) {
  mongoose.model(
    'User',
    new Schema(
      {
        name: { type: String },
        email: { type: String },
      },
      { timestamps: false }
    )
  );
}

export interface IOrderItem {
  product: Schema.Types.ObjectId;
  name: string;
  price: number;
  quantity: number;
}

export interface IOrderStatusHistory {
  status: OrderStatus;
  timestamp: Date;
  note?: string;
}

export interface IOrder extends Document {
  createdAt: Date;
  updatedAt: Date;
  user: any;
  items: IOrderItem[];
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  billingAddress: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  totals: {
    subtotal: number;
    discount: number;
    tax: number;
    shipping: number;
    grandTotal: number;
  };
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  paymentDetails?: Record<string, any>;
  orderStatus: OrderStatus;
  trackingNumber?: string;
  statusHistory: IOrderStatusHistory[];
}

const OrderItemSchema = new Schema<IOrderItem>({
  product: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
});

const OrderStatusHistorySchema = new Schema<IOrderStatusHistory>({
  status: {
    type: String,
    enum: Object.values(OrderStatus),
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  note: { type: String },
});

const OrderSchema = new Schema<IOrder>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    items: [OrderItemSchema],
    shippingAddress: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      postalCode: { type: String, required: true },
      country: { type: String, required: true },
    },
    billingAddress: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      postalCode: { type: String, required: true },
      country: { type: String, required: true },
    },
    totals: {
      subtotal: { type: Number, required: true },
      discount: { type: Number, required: true, default: 0 },
      tax: { type: Number, required: true, default: 0 },
      shipping: { type: Number, required: true, default: 0 },
      grandTotal: { type: Number, required: true },
    },
    paymentStatus: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.PENDING,
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: Object.values(PaymentMethod),
      default: PaymentMethod.STRIPE,
    },
    paymentDetails: {
      type: Map,
      of: Schema.Types.Mixed,
    },
    orderStatus: {
      type: String,
      enum: Object.values(OrderStatus),
      default: OrderStatus.PENDING,
      index: true,
    },
    trackingNumber: {
      type: String,
      index: true,
    },
    statusHistory: [OrderStatusHistorySchema],
  },
  {
    timestamps: true,
  }
);

export const Order = model<IOrder>('Order', OrderSchema);
export default Order;
