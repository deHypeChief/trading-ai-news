/* eslint-disable no-console */
const { connectDB, disconnectDB } = require('../src/config/database');
const { Event } = require('../src/models/Event');
const { runVolatilityEngine } = require('../src/services/volatilityEngine');
const { isGroqRateLimited } = require('../src/services/groq');

async function reanalyzeVolatility() {
  await connectDB();

  try {
    console.log('Starting comprehensive volatility re-analysis...');

    // Find events that need volatility analysis
    const events = await Event.find({
      $or: [
        { volatilityWindow: { $exists: false } },
        { expectedPipRange: { $exists: false } },
        { confidenceScore: { $exists: false } }
      ]
    }).limit(50); // Process in batches to avoid rate limits

    console.log(`Found ${events.length} events needing volatility analysis`);

    let processed = 0;
    let skipped = 0;

    for (const event of events) {
      try {
        // Skip if rate limited
        if (isGroqRateLimited()) {
          console.log('Rate limited, skipping remaining events');
          break;
        }

        console.log(`Processing: ${event.eventName}`);

        // Convert event to the format expected by volatility engine
        const eventInput = {
          title: event.eventName,
          description: event.description,
          currency: event.currency,
          impact: event.impact,
          previous: event.previous,
          forecast: event.forecast,
          actual: event.actual,
        };

        // Run volatility engine
        const vol = await runVolatilityEngine(eventInput);

        // Update the event with volatility data
        await Event.updateOne(
          { _id: event._id },
          {
            $set: {
              volatilityScore: vol.volatilityScore,
              volatilityWindow: vol.volatilityWindow,
              expectedPipRange: vol.expectedPipRange,
              pipRange: vol.pipRange,
              pipRangeComputedAt: vol.pipRange?.computedAt || new Date(),
              directionalBias: vol.directionalBias,
              confidenceScore: vol.confidenceScore,
              drivers: vol.drivers,
              executionNotes: vol.executionNotes,
            }
          }
        );

        processed++;
        console.log(`✅ Updated ${event.eventName}`);

        // Small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (err) {
        console.error(`❌ Failed to process ${event.eventName}:`, err.message);
        skipped++;
      }
    }

    console.log(`\n✅ Completed: ${processed} processed, ${skipped} skipped`);

  } catch (err) {
    console.error('Re-analysis failed:', err);
  } finally {
    await disconnectDB();
  }
}

// Run if called directly
if (require.main === module) {
  reanalyzeVolatility();
}

module.exports = { reanalyzeVolatility };