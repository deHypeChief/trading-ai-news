import MemoryModel from '../models/VolatilityMemory';
import { MemoryRecord, MarketRegime } from '../types/volatility';

export async function getEventMemory(eventKey: string, regime?: MarketRegime, limit = 20) {
  const query: any = { eventKey };
  if (regime) query.regime = regime;
  return MemoryModel.find(query).sort({ createdAt: -1 }).limit(limit).lean();
}

export async function storePrediction(record: Partial<MemoryRecord>) {
  return MemoryModel.create(record);
}

export async function storeOutcome(eventKey: string, realized: { realizedPipMove?: number; realizedWindow?: string; accuracyScore?: number }) {
  // attach to most recent record for eventKey
  const rec = await MemoryModel.findOne({ eventKey }).sort({ createdAt: -1 });
  if (!rec) return null;
  if (realized.realizedPipMove !== undefined) rec.realizedPipMove = realized.realizedPipMove;
  if (realized.realizedWindow !== undefined) rec.realizedWindow = realized.realizedWindow;
  if (realized.accuracyScore !== undefined) rec.accuracyScore = realized.accuracyScore;
  await rec.save();
  return rec;
}
