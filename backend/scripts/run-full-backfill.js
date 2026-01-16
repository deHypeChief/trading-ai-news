/* eslint-disable no-console */
// Load .env synchronously to ensure environment variables are available
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  try {
    const parsed = dotenv.parse(fs.readFileSync(envPath));
    Object.assign(process.env, parsed);
    // eslint-disable-next-line no-console
    console.log('Loaded .env from', envPath);
  } catch (err) {
    console.warn('Failed to load .env:', err?.message || err);
  }
}

const { connectDB, disconnectDB } = require('../src/config/database');
const { initRedis, getRedisClient, closeRedis } = require('../src/config/redis');
const { performBackfillRun } = require('../src/services/calendarSync');
const { isGenaiRateLimited } = require('../src/services/genai');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  await connectDB();
  try {
    await initRedis();
  } catch (err) {
    console.warn('Redis init failed; proceeding without persistent cursor (will use env start date if set)');
  }

  const redis = getRedisClient();
  const redisKey = process.env.CALENDAR_BACKFILL_REDIS_KEY || 'calendar:backfill:cursor';
  const startDateEnv = process.env.CALENDAR_BACKFILL_START_DATE;
  if (startDateEnv && redis) {
    try {
      const d = new Date(startDateEnv);
      await redis.set(redisKey, d.toISOString());
      console.log(`Set backfill cursor in Redis to ${d.toISOString()}`);
    } catch (err) {
      console.warn('Failed to set backfill cursor in redis', err?.message || err);
    }
  }

  const daysPerRun = parseInt(process.env.CALENDAR_SYNC_DAYS || '7', 10);
  const years = parseFloat(process.env.BACKFILL_YEARS || '1');
  const maxRuns = parseInt(process.env.BACKFILL_MAX_RUNS || `${Math.ceil((365 * years) / daysPerRun)}`, 10);

  console.log(`Starting full backfill: daysPerRun=${daysPerRun}, years=${years}, maxRuns=${maxRuns}`);

  let runCount = 0;

  while (runCount < maxRuns) {
    try {
      if (isGenaiRateLimited()) {
        console.warn('GenAI rate limit is active; pausing backfill run');
        break;
      }

      // Check current cursor
      let cursorDate = null;
      if (redis) {
        const v = await redis.get(redisKey);
        cursorDate = v ? new Date(v) : null;
      } else if (startDateEnv && runCount === 0) {
        cursorDate = new Date(startDateEnv);
      }

      if (cursorDate) {
        const stopDate = new Date(startDateEnv || cursorDate);
        stopDate.setFullYear(stopDate.getFullYear() - years);
        if (cursorDate <= stopDate) {
          console.log('Reached target stop date. Backfill complete.');
          break;
        }
      }

      console.log(`\n--- Backfill run #${runCount + 1} ---`);
      const res = await performBackfillRun(daysPerRun, { force: false });
      console.log('Backfill run result:', res);

      runCount++;

      // Small delay to avoid bursts
      await sleep(2000);
    } catch (err) {
      console.error('Backfill runner error:', err?.message || err);
      break;
    }
  }

  console.log(`Finished backfill loop. totalRuns=${runCount}`);

  try {
    await closeRedis();
  } catch (err) {
    // ignore
  }
  await disconnectDB();
}

if (require.main === module) {
  run().catch((err) => {
    console.error('Runner failed:', err);
    process.exit(1);
  });
}

module.exports = { run };
