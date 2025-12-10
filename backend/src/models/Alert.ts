import mongoose from 'mongoose';

interface IAlert {
  _id?: string;
  userId: mongoose.Types.ObjectId;
  
  // Alert settings
  enabled: boolean;
  currencies: string[]; // ['USD', 'EUR', 'GBP']
  minImpact: 'Low' | 'Medium' | 'High';
  minRelevanceScore?: number;
  
  // Timing preferences
  notifyBefore: number[]; // Minutes before event [30, 60, 120]
  
  // Quiet hours
  quietHoursEnabled: boolean;
  quietHoursStart?: string; // "22:00"
  quietHoursEnd?: string; // "08:00"
  
  // Notification channels
  emailNotifications: boolean;
  pushNotifications: boolean;
  
  // Alert history
  lastTriggered?: Date;
  alertsSentToday?: number;
  
  createdAt?: Date;
  updatedAt?: Date;
}

const alertSchema = new mongoose.Schema<IAlert>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    
    enabled: {
      type: Boolean,
      default: true,
    },
    
    currencies: [{
      type: String,
      uppercase: true,
    }],
    
    minImpact: {
      type: String,
      enum: ['Low', 'Medium', 'High'],
      default: 'Medium',
    },
    
    minRelevanceScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 50,
    },
    
    notifyBefore: [{
      type: Number,
      validate: {
        validator: (v: number) => [15, 30, 60, 120].includes(v),
        message: 'notifyBefore must be 15, 30, 60, or 120 minutes',
      },
    }],
    
    quietHoursEnabled: {
      type: Boolean,
      default: false,
    },
    
    quietHoursStart: {
      type: String,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/,
    },
    
    quietHoursEnd: {
      type: String,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/,
    },
    
    emailNotifications: {
      type: Boolean,
      default: true,
    },
    
    pushNotifications: {
      type: Boolean,
      default: false,
    },
    
    lastTriggered: Date,
    
    alertsSentToday: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure one alert config per user
alertSchema.index({ userId: 1 }, { unique: true });

export const Alert = mongoose.model<IAlert>('Alert', alertSchema);
export type { IAlert };
