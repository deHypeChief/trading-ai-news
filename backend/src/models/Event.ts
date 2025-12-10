import mongoose from 'mongoose';

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
  volatilityPrediction?: 'Low' | 'Medium' | 'High' | 'Extreme';
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
    },
    volatilityPrediction: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Extreme'],
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
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient querying
eventSchema.index({ eventDateTime: 1, impact: -1 });
eventSchema.index({ currency: 1, eventDateTime: 1 });
eventSchema.index({ aiRelevanceScore: -1 });

export const Event = mongoose.model<IEvent>('Event', eventSchema);
export type { IEvent };
