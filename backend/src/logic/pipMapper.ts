import { PipRange } from '../types/volatility';

export function mapPipRange(volatilityScore: number, isJPY: boolean): PipRange {
  const scale = isJPY ? 0.7 : 1;

  const ranges: Record<number, [number, number]> = {
    1: [5, 12],
    2: [10, 25],
    3: [25, 45],
    4: [45, 80],
    5: [80, 150],
  };

  const [min, max] = ranges[volatilityScore] || ranges[3];

  return {
    min: Math.round(min * scale),
    max: Math.round(max * scale),
  };
}
