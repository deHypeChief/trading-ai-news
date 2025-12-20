/* eslint-disable no-console */
const mongoose = require('mongoose');
const { Event } = require('../src/models/Event');
const { runVolatilityEngine } = require('../src/services/volatilityEngine');

async function run() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/trading-ai-news';
  await mongoose.connect(mongoUri);
  console.log('Connected to DB');

  const ev = await Event.findOne().lean();
  if (!ev) {
    console.error('No events found in DB');
    await mongoose.disconnect();
    return process.exit(1);
  }

  console.log('Using event:', ev.eventName, ev.eventId || ev._id);

  try {
    const vol = await runVolatilityEngine(ev, process.env.CURRENT_MARKET_REGIME || undefined);
    console.log('Volatility result:', vol);

    // Persist pipRange if present
    if (vol.pipRange) {
      await Event.updateOne({ _id: ev._id }, { $set: { pipRange: vol.pipRange, pipRangeComputedAt: vol.pipRange.computedAt || new Date() } });
      console.log('Updated event with pipRange');
    } else {
      console.log('No pipRange returned by engine');
    }
  } catch (err) {
    console.error('Engine run failed:', err.message || err);
  }

  await mongoose.disconnect();
  console.log('Done');
}

if (require.main === module) {
  run().catch(e => {
    console.error('Script failed:', e);
    process.exit(1);
  });
}

module.exports = { run };
