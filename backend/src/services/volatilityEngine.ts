import { inferVolatility } from './groq';
import { getEventMemory, storePrediction } from './volatilityMemory';
import { mapPipRange } from '../logic/pipMapper';
import { adjustFromMemory } from '../logic/memoryAdjuster';
import { applyRegimeBias } from '../logic/regimeAdjuster';
import { VolatilityResult, MarketRegime } from '../types/volatility';

export async function runVolatilityEngine(event: any, regime?: MarketRegime): Promise<VolatilityResult> {
  const eventKey = `${event.eventName}_${event.currency}`;

  const memory = await getEventMemory(eventKey, regime);

  // Call Groq for base inference
  const groqOut = await inferVolatility({
    title: event.eventName,
    description: event.description,
    currency: event.currency,
    impact: event.impact,
    previous: event.previous,
    forecast: event.forecast,
    actual: event.actual,
  });

  let { volatilityScore, volatilityWindow, drivers, directionalBias, executionNotes } = groqOut;

  // Adjust from memory and regime
  volatilityScore = adjustFromMemory(volatilityScore, memory as any[]);
  volatilityScore = applyRegimeBias(volatilityScore, regime);

  const expectedPipRange = mapPipRange(volatilityScore, (event.currency || '').toUpperCase() === 'JPY');

  const confidenceScore = Math.min(95, 50 + (memory?.length || 0) * 2 + volatilityScore * 5);

  const result: VolatilityResult = {
    eventKey,
    eventWeight: event.impact === 'High' ? 80 : event.impact === 'Medium' ? 50 : 20,
    volatilityScore,
    volatilityWindow,
    expectedPipRange,
    // computed pipRange: try to populate basic computed fields from expectedPipRange
    pipRange: undefined,
    directionalBias,
    confidenceScore,
    drivers,
    executionNotes,
  };

  // If we have an expected pip range, synthesize a computed pipRange (best-effort)
  try {
    if (expectedPipRange && typeof expectedPipRange.min === 'number' && typeof expectedPipRange.max === 'number') {
      // Representative pair map (align with migration script)
      const pairMap: Record<string, string> = {
        USD: 'USD/JPY',
        EUR: 'EUR/USD',
        GBP: 'GBP/USD',
        JPY: 'USD/JPY',
        AUD: 'AUD/USD',
        CAD: 'USD/CAD',
        CHF: 'USD/CHF',
        NZD: 'NZD/USD',
      };

      const currency = (event.currency || 'USD').toUpperCase();
      const pair = pairMap[currency] || `${currency}/USD`;
      const pipSize = pair.endsWith('JPY') ? 0.01 : 0.0001;
      const pips = Math.round((expectedPipRange.min + expectedPipRange.max) / 2);
      result.pipRange = {
        pair,
        pipSize,
        pips,
        min: expectedPipRange.min,
        max: expectedPipRange.max,
        windowMinutes: 60,
        computedAt: new Date(),
      };
    }
  } catch (e) {
    // non-fatal
  }

  // Persist prediction in memory
  try {
    await storePrediction({
      eventKey,
      regime: regime || 'Pause',
      predictedScore: result.volatilityScore,
      predictedWindow: result.volatilityWindow,
      predictedPipRange: result.expectedPipRange,
      predictedConfidence: result.confidenceScore,
      drivers: result.drivers,
      executionNotes: result.executionNotes,
    });
  } catch (err) {
    console.warn('Failed to store volatility prediction in memory:', err?.message || err);
  }

  return result;
}
