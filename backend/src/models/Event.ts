import mongoose from 'mongoose';
import { VolatilityWindow, MarketRegime, PipRange, DirectionalBias } from '../types/volatility';

interface IEvent {
  _id?: string;
  eventId: string; // External ID from source
  eventName: string;
  country: string;
  currency: string;
  eventDateTime: Date;
  impact: 'High' | 'Medium' | 'Low';
  forecast?: string;
  previous?: string;
  actual?: string;
  description?: string;
  source: 'TradingEconomics' | 'ForexFactory';
  
  // AI Analysis
  aiRelevanceScore?: number;
  /** @deprecated use volatilityScore, volatilityWindow, expectedPipRange */
  volatilityPrediction?: 'Low' | 'Medium' | 'High' | 'Extreme';

  // New volatility fields
  volatilityScore?: number; // 1-5
  volatilityWindow?: VolatilityWindow;
  expectedPipRange?: PipRange;
  directionalBias?: DirectionalBias;
  confidenceScore?: number; // 0-100
  drivers?: string[];
  executionNotes?: string;

  // Regime at time of prediction (optional)
  currentRegime?: MarketRegime;

  aiReasoning?: string;
  tradingRecommendation?: string;
  aiAnalyzedAt?: Date;
  aiInDepthAnalysis?: string;

  // News & Summaries
  aiSummary?: string;
  newsHeadline?: string;
  newsUrl?: string;
  newsSource?: string;
  newsPublishedAt?: Date;
  newsFetchedAt?: Date;

  // Realized / outcome fields (post-event)
  realizedPipMove?: number;
  realizedWindow?: VolatilityWindow;
  accuracyScore?: number; // 0-100
  
  createdAt?: Date;
  updatedAt?: Date;
}

const eventSchema = new mongoose.Schema<IEvent>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    eventName: {
      type: String,
      required: true,
    },
    country: {
      type: String,
      required: true,
    },
    currency: {
      type: String,
      required: true,
      index: true,
    },
    eventDateTime: {
      type: Date,
      required: true,
      index: true,
    },
    impact: {
      type: String,
      enum: ['High', 'Medium', 'Low'],
      default: 'Medium',
      index: true,
    },
    forecast: String,
    previous: String,
    actual: String,
    description: String,
    source: {
      type: String,
      enum: ['TradingEconomics', 'ForexFactory'],
      required: true,
    },
    
    // AI Analysis Fields
    aiRelevanceScore: {
      type: Number,
      min: 0,
      max: 100,
      index: true,
    },
    /** @deprecated use volatilityScore, volatilityWindow, expectedPipRange */
    volatilityPrediction: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Extreme'],
    },

    // New volatility fields
    volatilityScore: {
      type: Number,
      min: 1,
      max: 5,
      index: true,
    },
    volatilityWindow: {
      type: String,
      enum: ['Pre-Event', 'At-Release', 'Post-Release', 'Extended'],
    },
    expectedPipRange: {
      min: { type: Number },
      max: { type: Number },
    },
    directionalBias: {
      type: String,
      enum: ['Bullish', 'Bearish', 'Neutral', 'Two-Way'],
      default: 'Neutral',
    },
    confidenceScore: {
      type: Number,
      min: 0,
      max: 100,
      index: true,
    },
    drivers: [String],
    executionNotes: String,

    currentRegime: {
      type: String,
      enum: ['Aggressive Tightening','Late Tightening','Pause','Pre-Easing','Active Easing','Liquidity-Stressed','Positioning-Extreme','Repricing','Crisis'],
    },

    aiReasoning: String,
    tradingRecommendation: String,
    aiAnalyzedAt: Date,
    aiInDepthAnalysis: {
      type: String,
      maxlength: 1600,
    },

    // News & Summaries
    aiSummary: {
      type: String,
      maxlength: 800,
    },
    newsHeadline: String,
    newsUrl: String,
    newsSource: String,
    newsPublishedAt: Date,
    newsFetchedAt: Date,

    // Outcome fields (filled post-event)
    realizedPipMove: Number,
    realizedWindow: {
      type: String,
      enum: ['Pre-Event', 'At-Release', 'Post-Release', 'Extended'],
    },
    accuracyScore: {
      type: Number,
      min: 0,
      max: 100,
      index: true,
    },
    // Computed pip range (from market candles)
    pipRange: {
      pair: String,
      pipSize: Number,
      high: Number,
      low: Number,
      pips: Number,
      min: Number,
      max: Number,
      windowMinutes: Number,
      computedAt: Date,
    },
    pipRangeComputedAt: Date,
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient querying
eventSchema.index({ eventDateTime: 1, impact: -1 });
eventSchema.index({ currency: 1, eventDateTime: 1 });
eventSchema.index({ aiRelevanceScore: -1 });

// Volatility/search indexes
eventSchema.index({ volatilityScore: -1 });
eventSchema.index({ confidenceScore: -1 });
eventSchema.index({ currentRegime: 1 });

export const Event = mongoose.model<IEvent>('Event', eventSchema);
export type { IEvent };
