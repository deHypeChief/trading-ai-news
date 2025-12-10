import mongoose from 'mongoose';
import bcryptjs from 'bcryptjs';

interface IUser {
  _id?: string;
  email: string;
  password: string;
  username: string;
  timezone: string;
  trackedInstruments: string[];
  alertSettings: {
    emailAlerts: boolean;
    pushAlerts: boolean;
    dailyDigest: boolean;
    weeklyDigest: boolean;
    quietHoursStart?: string;
    quietHoursEnd?: string;
    alertThreshold: number;
  };
  subscription: {
    plan: 'free' | 'monthly' | 'yearly';
    status: 'active' | 'inactive' | 'cancelled';
    renewalDate?: Date;
    paymentMethod?: 'paystack' | 'cryptomus';
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const userSchema = new mongoose.Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: /.+\@.+\..+/,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    username: {
      type: String,
      required: true,
      unique: true,
    },
    timezone: {
      type: String,
      default: 'UTC',
    },
    trackedInstruments: {
      type: [String],
      default: [],
    },
    alertSettings: {
      emailAlerts: { type: Boolean, default: true },
      pushAlerts: { type: Boolean, default: false },
      dailyDigest: { type: Boolean, default: true },
      weeklyDigest: { type: Boolean, default: false },
      quietHoursStart: String,
      quietHoursEnd: String,
      alertThreshold: { type: Number, default: 70 },
    },
    subscription: {
      plan: { type: String, enum: ['free', 'monthly', 'yearly'], default: 'free' },
      status: { type: String, enum: ['active', 'inactive', 'cancelled'], default: 'inactive' },
      renewalDate: Date,
      paymentMethod: { type: String, enum: ['paystack', 'cryptomus'] },
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcryptjs.genSalt(10);
    this.password = await bcryptjs.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword: string) {
  return await bcryptjs.compare(candidatePassword, this.password);
};

export const User = mongoose.model<IUser>('User', userSchema);
