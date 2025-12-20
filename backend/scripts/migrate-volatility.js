/* eslint-disable no-console */
const { connectDB, disconnectDB } = require('../src/config/database');
const { Event } = require('../src/models/Event');
const MemoryModel = require('../src/models/VolatilityMemory').default;

function mapPredictionToScore(pred) {
  if (!pred) return null;
  const map = {
    Low: 1,
    Medium: 2,
    High: 4,
    Extreme: 5,
  };
  return map[pred] || null;
}

function mapPipRange(volatilityScore, isJPY) {
  if (!volatilityScore) return null;
  const scale = isJPY ? 0.7 : 1;
  const ranges = {
    1: [5, 12],
    2: [10, 25],
    3: [25, 45],
    4: [45, 80],
    5: [80, 150],
  };
  const [min, max] = ranges[volatilityScore] || ranges[3];
  return { min: Math.round(min * scale), max: Math.round(max * scale) };
}

(async function main() {
  await connectDB();
  try {
    console.log('Scanning events for migration...');
    const cursor = Event.find().cursor();
    let count = 0;
    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
      let modified = false;
      if ((doc.volatilityScore === undefined || doc.volatilityScore === null) && doc.volatilityPrediction) {
        const score = mapPredictionToScore(doc.volatilityPrediction);
        if (score) {
          doc.volatilityScore = score;
          modified = true;
        }
      }

      if ((doc.expectedPipRange === undefined || doc.expectedPipRange === null) && doc.volatilityScore) {
        const isJPY = (doc.currency || '').toUpperCase() === 'JPY';
        doc.expectedPipRange = mapPipRange(doc.volatilityScore, isJPY);
        modified = true;
      }

      if (modified) {
        await doc.save();
        count += 1;
      }
    }

    console.log(`✅ Migration applied to ${count} documents`);

    console.log('Ensuring indexes for Event and VolatilityMemory...');
    await Event.createIndexes();
    await MemoryModel.createIndexes();
    console.log('✅ Indexes created');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await disconnectDB();
  }
})();
