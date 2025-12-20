import assert from 'assert';
import { mapPipRange } from '../logic/pipMapper';
import { adjustFromMemory } from '../logic/memoryAdjuster';
import { applyRegimeBias } from '../logic/regimeAdjuster';

console.log('Running volatility logic tests...');

// Pip mapping
const p1 = mapPipRange(1, false);
assert.strictEqual(p1.min, 5, 'PipRange 1.min should be 5');
assert.strictEqual(p1.max, 12, 'PipRange 1.max should be 12');

const p5 = mapPipRange(5, true); // JPY scaled
assert.ok(p5.min > 0 && p5.max > 0, 'JPY pip range should be positive');

// Memory adjuster
const base = 3;
const memLow = [{ realizedPipMove: 10 }, { realizedPipMove: 12 }, { realizedPipMove: 8 }];
const adjustedLow = adjustFromMemory(base, memLow);
assert.strictEqual(adjustedLow, 2 || base, 'Should reduce score when avgRealized <15');

const memHigh = [{ realizedPipMove: 80 }, { realizedPipMove: 90 }, { realizedPipMove: 60 }];
const adjustedHigh = adjustFromMemory(base, memHigh);
assert.strictEqual(adjustedHigh, 4 || base, 'Should increase score when avgRealized >70');

// Not enough memory
const memFew = [{ realizedPipMove: 80 }];
assert.strictEqual(adjustFromMemory(base, memFew), base, 'Should not change when memory < 3');

// Regime adjuster
assert.strictEqual(applyRegimeBias(3, 'Liquidity-Stressed'), 4, 'Liquidity stress should increase score by 1');
assert.strictEqual(applyRegimeBias(2, 'Pause'), 1, 'Pause should decrease score by 1');
assert.strictEqual(applyRegimeBias(4, 'Aggressive Tightening'), 5, 'Aggressive Tightening should increase score');

console.log('All volatility tests passed ✅');
