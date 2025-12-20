/* eslint-disable no-console */
const axios = require('axios');
const mongoose = require('mongoose');
const { Event } = require('../src/models/Event');

// Configure provider via env
const PROVIDER = process.env.PIP_DATA_PROVIDER || 'TWELVE_DATA';
const TWELVE_KEY = process.env.TWELVE_DATA_API_KEY || process.env.TWELVEDATA_API_KEY;

// Pair mapping for representative pairs when only a currency is present
const pairMap = {
  USD: 'USD/JPY',
  EUR: 'EUR/USD',
  GBP: 'GBP/USD',
  JPY: 'USD/JPY',
  AUD: 'AUD/USD',
  CAD: 'USD/CAD',
  CHF: 'USD/CHF',
  NZD: 'NZD/USD',
};

function toSymbol(pair) {
  // Twelve Data expects e.g. "USD/JPY"
  return pair;
}

function pipSizeForPair(pair) {
  if (pair.endsWith('JPY')) return 0.01;
  return 0.0001;
}

async function fetchCandlesTwelve(symbol, startIso, endIso) {
  if (!TWELVE_KEY) throw new Error('TWELVE_DATA_API_KEY not configured');

  const params = {
    symbol,
    interval: '1min',
    start_date: startIso,
    end_date: endIso,
    format: 'JSON',
    apikey: TWELVE_KEY,
    outputsize: 5000,
  };

  const resp = await axios.get('https://api.twelvedata.com/time_series', { params, timeout: 15000 });
  if (resp.data?.status === 'error') throw new Error(resp.data?.message || 'Twelve Data error');
  return resp.data?.values || [];
}

async function computePipRangeForEvent(event) {
  const currency = event.currency || 'USD';
  const pair = pairMap[currency] || `${currency}/USD`;
  const symbol = toSymbol(pair);
  const pipSize = pipSizeForPair(pair);

  const eventTime = new Date(event.eventDateTime || event.eventDate || event.date || Date.now());
  const start = new Date(eventTime.getTime() - 30 * 60 * 1000); // -30 min
  const end = new Date(eventTime.getTime() + 30 * 60 * 1000); // +30 min

  try {
    let candles = [];
    if (PROVIDER === 'TWELVE_DATA') {
      candles = await fetchCandlesTwelve(symbol, start.toISOString(), end.toISOString());
    } else {
      throw new Error('Unsupported provider: ' + PROVIDER);
    }

    if (!candles || candles.length === 0) {
      console.warn(`  No candles for ${symbol} around ${eventTime.toISOString()}`);
      return null;
    }

    // candles are returned newest-first; map values
    const highs = candles.map(c => parseFloat(c.high)).filter(Boolean);
    const lows = candles.map(c => parseFloat(c.low)).filter(Boolean);
    if (highs.length === 0 || lows.length === 0) return null;

    const high = Math.max(...highs);
    const low = Math.min(...lows);
    const pips = Math.round(Math.abs(high - low) / pipSize);

    return {
      pair,
      pipSize,
      high,
      low,
      pips,
      windowMinutes: 60,
      computedAt: new Date(),
    };
  } catch (err) {
    console.error('  Error fetching candles:', err.message || err);
    return null;
  }
}

async function run() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/trading-ai-news';
  await mongoose.connect(mongoUri);
  console.log('Connected to DB');

  // Find events missing pipRange or pips
  const events = await Event.find({
    $or: [
      { 'pipRange.pips': { $exists: false } },
      { pipRange: { $exists: false } }
    ]
  }).limit(200);

  console.log(`Found ${events.length} events needing pip range`);

  for (const ev of events) {
    try {
      console.log(`Processing: ${ev.eventName} (${ev.currency}) at ${ev.eventDateTime || ev.eventDate || ev.date}`);
      const result = await computePipRangeForEvent(ev);
      if (result) {
        await Event.updateOne({ _id: ev._id }, { $set: { pipRange: result, pipRangeComputedAt: new Date() } });
        console.log(`  ✅ Updated pipRange: ${result.pips} pips for ${result.pair}`);
      } else {
        console.log('  ⚠️ No pip range computed');
      }
      // avoid aggressive rate limits
      await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      console.error('  Error processing event:', err.message || err);
    }
  }

  await mongoose.disconnect();
  console.log('Finished');
}

if (require.main === module) {
  if (!process.env.TWELVE_DATA_API_KEY && !process.env.TWELVEDATA_API_KEY) {
    console.warn('No Twelve Data API key set (TWELVE_DATA_API_KEY). Migration will attempt but likely fail to fetch remote data.');
  }
  run().catch(e => {
    console.error('Migration failed:', e);
    process.exit(1);
  });
}

module.exports = { run };
