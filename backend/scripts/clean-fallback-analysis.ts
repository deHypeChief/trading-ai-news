/**
 * scripts/clean-fallback-analysis.ts
 * 
 * Cleans up events that were polluted with generic fallback structured analysis data.
 * 
 * Usage:
 *   bun run scripts/clean-fallback-analysis.ts           # Dry run (shows what would be cleaned)
 *   bun run scripts/clean-fallback-analysis.ts --execute # Actually clean the data
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// The fallback text patterns to detect
const FALLBACK_PATTERNS = {
  whatThisMeans: 'This economic event may influence market sentiment and currency movements.',
  marketImpact: 'may experience volatility based on the event outcome.',
  crossAssetImpact: 'The event could have ripple effects across major currency pairs, commodities, and equity markets depending on the surprise factor.',
};

async function main() {
  const execute = process.argv.includes('--execute');
  
  console.log(`\n🔍 Scanning for events with fallback structured analysis data...\n`);
  console.log(execute ? '⚠️  EXECUTE MODE: Will clean data\n' : '📋 DRY RUN MODE: No changes will be made\n');

  // Connect to MongoDB
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('❌ Missing MONGODB_URI environment variable');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB\n');

  const Event = mongoose.connection.collection('events');

  // Find events with fallback data
  const query = {
    $or: [
      { whatThisMeans: FALLBACK_PATTERNS.whatThisMeans },
      { marketImpact: { $regex: FALLBACK_PATTERNS.marketImpact, $options: 'i' } },
      { crossAssetImpact: FALLBACK_PATTERNS.crossAssetImpact },
    ],
  };

  const compromisedEvents = await Event.find(query).toArray();
  
  console.log(`Found ${compromisedEvents.length} events with fallback data:\n`);

  if (compromisedEvents.length === 0) {
    console.log('✅ No compromised events found. Database is clean!\n');
    await mongoose.disconnect();
    process.exit(0);
  }

  // Show sample of affected events
  const sample = compromisedEvents.slice(0, 10);
  for (const event of sample) {
    console.log(`  - ${event.eventName} (${event.currency}) @ ${event.eventDateTime}`);
    console.log(`    ID: ${event.eventId || event._id}`);
    if (event.whatThisMeans === FALLBACK_PATTERNS.whatThisMeans) {
      console.log(`    ⚠️  whatThisMeans: FALLBACK`);
    }
    if (event.marketImpact?.includes('may experience volatility based on the event outcome')) {
      console.log(`    ⚠️  marketImpact: FALLBACK`);
    }
    if (event.crossAssetImpact === FALLBACK_PATTERNS.crossAssetImpact) {
      console.log(`    ⚠️  crossAssetImpact: FALLBACK`);
    }
    console.log('');
  }

  if (compromisedEvents.length > 10) {
    console.log(`  ... and ${compromisedEvents.length - 10} more\n`);
  }

  if (!execute) {
    console.log('─'.repeat(60));
    console.log('\n📋 DRY RUN complete. To actually clean these events, run:');
    console.log('   bun run scripts/clean-fallback-analysis.ts --execute\n');
    await mongoose.disconnect();
    process.exit(0);
  }

  // Execute the cleanup
  console.log('🧹 Cleaning fallback data...\n');

  const result = await Event.updateMany(query, {
    $unset: {
      anticipatedVolatility: '',
      whatThisMeans: '',
      marketImpact: '',
      crossAssetImpact: '',
    },
  });

  console.log(`✅ Cleaned ${result.modifiedCount} events\n`);
  console.log('The structured analysis fields have been removed.');
  console.log('They will be regenerated with real AI data when users expand those events.\n');

  await mongoose.disconnect();
  console.log('✅ Done!\n');
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
