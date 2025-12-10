import mongoose from 'mongoose';

interface ISubscription {
  _id?: string;
  userId: string;
  plan: 'monthly' | 'yearly';
  status: 'active' | 'inactive' | 'cancelled';
  startDate: Date;
  renewalDate: Date;
  paymentProvider: 'paystack' | 'cryptomus';
  transactionId: string;
  amount: number;
  currency: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const subscriptionSchema = new mongoose.Schema<ISubscription>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    plan: {
      type: String,
      enum: ['monthly', 'yearly'],
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'cancelled'],
      default: 'active',
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    renewalDate: {
      type: Date,
      required: true,
    },
    paymentProvider: {
      type: String,
      enum: ['paystack', 'cryptomus'],
      required: true,
    },
    transactionId: {
      type: String,
      required: true,
      unique: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'USD',
    },
  },
  {
    timestamps: true,
  }
);

subscriptionSchema.index({ userId: 1, status: 1 });

export const Subscription = mongoose.model<ISubscription>('Subscription', subscriptionSchema);
