import { MarketRegime } from '../types/volatility';

export function applyRegimeBias(score: number, regime?: MarketRegime): number {
  if (!regime) return score;
  if (regime === 'Liquidity-Stressed') return Math.min(5, score + 1);
  if (regime === 'Pause') return Math.max(1, score - 1);
  if (regime === 'Aggressive Tightening') return Math.min(5, score + 1);
  // other regimes could be handled with different biases
  return score;
}
