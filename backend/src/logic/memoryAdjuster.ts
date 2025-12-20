import { MemoryModel } from '../models/VolatilityMemory';

export function adjustFromMemory(baseScore: number, memory: any[]) {
  if (!memory || memory.length < 3) return baseScore;

  const avgRealized =
    memory.reduce((s: number, m: any) => s + (m.realizedPipMove || 0), 0) / memory.length;

  if (avgRealized > 70) return Math.min(5, baseScore + 1);
  if (avgRealized < 15) return Math.max(1, baseScore - 1);

  return baseScore;
}
