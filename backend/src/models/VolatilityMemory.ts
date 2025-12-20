import mongoose from 'mongoose';
import { VolatilityWindow, MarketRegime, PipRange } from '../types/volatility';

export interface MemoryRecord {
  eventKey: string;
  regime: MarketRegime;
  predictedScore: number;
  predictedWindow: VolatilityWindow;
  predictedPipRange: PipRange;
  predictedConfidence?: number;
  drivers?: string[];
  executionNotes?: string;
  realizedPipMove?: number;
  realizedWindow?: VolatilityWindow;
  accuracyScore?: number;
  createdAt?: Date;
}

const memorySchema = new mongoose.Schema<MemoryRecord>(
  {
    eventKey: { type: String, required: true, index: true },
    regime: {
      type: String,
      enum: [
        'Aggressive Tightening',
        'Late Tightening',
        'Pause',
        'Pre-Easing',
        'Active Easing',
        'Liquidity-Stressed',
        'Positioning-Extreme',
        'Repricing',
        'Crisis',
      ],
      required: true,
      index: true,
    },
    predictedScore: { type: Number, min: 1, max: 5, required: true, index: true },
    predictedWindow: {
      type: String,
      enum: ['Pre-Event', 'At-Release', 'Post-Release', 'Extended'],
    },
    predictedPipRange: {
      min: { type: Number },
      max: { type: Number },
    },
    predictedConfidence: { type: Number, min: 0, max: 100 },
    drivers: [String],
    executionNotes: String,
    realizedPipMove: Number,
    realizedWindow: {
      type: String,
      enum: ['Pre-Event', 'At-Release', 'Post-Release', 'Extended'],
    },
    accuracyScore: { type: Number, min: 0, max: 100 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

memorySchema.index({ eventKey: 1, regime: 1, createdAt: -1 });

export const MemoryModel = mongoose.model<MemoryRecord>('VolatilityMemory', memorySchema);
export default MemoryModel;
