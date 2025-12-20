export type VolatilityWindow =
  | "Pre-Event"
  | "At-Release"
  | "Post-Release"
  | "Extended";

export type MarketRegime =
  | "Aggressive Tightening"
  | "Late Tightening"
  | "Pause"
  | "Pre-Easing"
  | "Active Easing"
  | "Liquidity-Stressed"
  | "Positioning-Extreme"
  | "Repricing"
  | "Crisis";

export interface PipRange {
  min: number;
  max: number;
}

export interface ComputedPipRange {
  pair?: string;
  pipSize?: number;
  high?: number;
  low?: number;
  pips?: number;
  min?: number;
  max?: number;
  windowMinutes?: number;
  computedAt?: Date;
}

export type DirectionalBias = "Bullish" | "Bearish" | "Neutral" | "Two-Way";

export interface VolatilityResult {
  eventKey: string;
  eventWeight?: number; // 0-100
  volatilityScore: number; // 1-5
  volatilityWindow: VolatilityWindow;
  expectedPipRange: PipRange;
  pipRange?: ComputedPipRange;
  directionalBias: DirectionalBias;
  confidenceScore: number; // 0-100
  drivers: string[];
  executionNotes: string;
}
