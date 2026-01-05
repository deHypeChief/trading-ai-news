/* eslint-disable no-console */
const { connectDB, disconnectDB } = require('../src/config/database');
const { fetchEconomicEvents } = require('../src/services/calendar');
const { Event } = require('../src/models/Event');
const { analyzeEventRelevance, summarizeTextShort, generateInDepthAnalysis, isGroqRateLimited } = require('../src/services/groq');
const { runVolatilityEngine } = require('../src/services/volatilityEngine');
const { fetchNewsForEvent } = require('../src/services/news');

function usage() {
  console.log('\nUsage: bun run seed-data <startDate> <endDate> [--force]');
  console.log('Dates should be in ISO or YYYY-MM-DD format.');
  console.log('Example: bun run seed-data 2025-01-01 2025-06-30 --force\n');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function seedRange(startDate, endDate, opts = {}) {
  const force = !!opts.force;

  let cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const overall = {
    batches: 0,
    synced: 0,
    skipped: 0,
    analyzed: 0,
    summarized: 0,
    indepth: 0,
    errors: 0,
  };

  while (cursor <= end) {
    const batchStart = new Date(cursor);
    const batchEnd = new Date(batchStart);
    batchEnd.setDate(batchEnd.getDate() + 6);
    if (batchEnd > end) batchEnd.setTime(end.getTime());

    console.log(`\n📅 [Seed] Processing batch ${batchStart.toISOString()} -> ${batchEnd.toISOString()} (force=${force})`);

    try {
      const externalEventsRaw = await fetchEconomicEvents(batchStart, batchEnd);
      console.log(`  Fetched ${externalEventsRaw.length} events`);

      // Deduplicate
      const map = new Map();
      for (const e of externalEventsRaw) map.set(e.eventId, e);
      const externalEvents = Array.from(map.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      let syncedCount = 0;
      let skippedCount = 0;
      let analyzedCount = 0;
      let summarizedCount = 0;
      let indepthCount = 0;

      let groqLimited = false;

      for (const externalEvent of externalEvents) {
        try {
          if (!force) {
            const exists = await Event.findOne({ eventId: externalEvent.eventId }).lean();
            if (exists) {
              skippedCount++;
              continue;
            }
          }

          const event = await Event.findOneAndUpdate(
            { eventId: externalEvent.eventId },
            {
              $set: {
                eventName: externalEvent.title,
                country: externalEvent.country,
                currency: externalEvent.currency,
                eventDateTime: externalEvent.date,
                impact: externalEvent.impact,
                forecast: externalEvent.forecast,
                previous: externalEvent.previous,
                actual: externalEvent.actual,
                description: externalEvent.description,
                source: externalEvent.source,
              },
            },
            { upsert: true, new: true }
          );

          syncedCount++;

          // AI analysis
          if (!groqLimited && !isGroqRateLimited()) {
            try {
              const ai = await analyzeEventRelevance({
                title: externalEvent.title,
                description: externalEvent.description,
                currency: externalEvent.currency,
                impact: externalEvent.impact,
                previous: externalEvent.previous,
                forecast: externalEvent.forecast,
                actual: externalEvent.actual,
              });

              await Event.updateOne({ eventId: externalEvent.eventId }, { $set: {
                aiRelevanceScore: ai.relevanceScore,
                volatilityPrediction: ai.volatilityPrediction,
                aiReasoning: ai.reasoning,
                tradingRecommendation: ai.tradingRecommendation,
                aiAnalyzedAt: new Date(),
              }});

              analyzedCount++;
            } catch (err) {
              if (err?.code === 'GROQ_RATE_LIMIT') {
                groqLimited = true;
                console.warn('  Groq rate limit reached; skipping remaining AI work in this batch');
              } else {
                console.warn('  AI analysis failed for', externalEvent.title, err?.message || err);
              }
            }
          }

          // Volatility
          if (!groqLimited && !isGroqRateLimited()) {
            try {
              const regime = process.env.CURRENT_MARKET_REGIME;
              const vol = await runVolatilityEngine(externalEvent, regime);
              await Event.updateOne({ eventId: externalEvent.eventId }, { $set: {
                volatilityScore: vol.volatilityScore,
                volatilityWindow: vol.volatilityWindow,
                expectedPipRange: vol.expectedPipRange,
                pipRange: vol.pipRange,
                pipRangeComputedAt: vol.pipRange?.computedAt || new Date(),
                directionalBias: vol.directionalBias,
                confidenceScore: vol.confidenceScore,
                drivers: vol.drivers,
                executionNotes: vol.executionNotes,
                currentRegime: regime,
              }});
            } catch (err) {
              console.warn('  Volatility engine failed for', externalEvent.title, err?.message || err);
            }
          }

          // News + summary
          let shortSummary = '';
          if (!groqLimited && !isGroqRateLimited()) {
            try {
              const news = await fetchNewsForEvent(externalEvent.title, externalEvent.currency, externalEvent.date);
              if (news) {
                const summary = await summarizeTextShort(news.summaryHint || news.headline || externalEvent.description || '', news.headline);
                shortSummary = summary.summary;
                await Event.updateOne({ eventId: externalEvent.eventId }, { $set: {
                  aiSummary: summary.summary,
                  newsHeadline: news.headline,
                  newsUrl: news.url,
                  newsSource: news.source,
                  newsPublishedAt: news.publishedAt ? new Date(news.publishedAt) : undefined,
                  newsFetchedAt: new Date(),
                }});
                summarizedCount++;
              } else if (externalEvent.description) {
                const summary = await summarizeTextShort(externalEvent.description, externalEvent.title);
                shortSummary = summary.summary;
                await Event.updateOne({ eventId: externalEvent.eventId }, { $set: { aiSummary: summary.summary } });
                summarizedCount++;
              }
            } catch (err) {
              if (err?.code === 'GROQ_RATE_LIMIT') {
                groqLimited = true;
                console.warn('  Groq rate limit reached during news/summarize; skipping remaining AI work in this batch');
              } else {
                console.warn('  News fetch/summarize failed for', externalEvent.title, err?.message || err);
              }
            }
          }

          // In-depth
          if (!groqLimited && !isGroqRateLimited()) {
            try {
              const indepth = await generateInDepthAnalysis({
                title: externalEvent.title,
                description: externalEvent.description,
                currency: externalEvent.currency,
                impact: externalEvent.impact,
                previous: externalEvent.previous,
                forecast: externalEvent.forecast,
                actual: externalEvent.actual,
                newsHeadline: undefined,
                newsSummary: shortSummary,
              });

              if (indepth) {
                await Event.updateOne({ eventId: externalEvent.eventId }, { $set: { aiInDepthAnalysis: indepth } });
                indepthCount++;
              }
            } catch (err) {
              if (err?.code === 'GROQ_RATE_LIMIT') {
                groqLimited = true;
                console.warn('  Groq rate limit reached during in-depth; skipping remaining AI work in this batch');
              } else {
                console.warn('  In-depth analysis failed for', externalEvent.title, err?.message || err);
              }
            }
          }

          // Small sleep between events to avoid API bursts
          await sleep(300);
        } catch (err) {
          console.error('  Failed to process event:', externalEvent.title, err?.message || err);
          overall.errors++;
        }
      }

      overall.batches++;
      overall.synced += syncedCount;
      overall.skipped += skippedCount;
      overall.analyzed += analyzedCount;
      overall.summarized += summarizedCount;
      overall.indepth += indepthCount;

      console.log(`  Batch complete: synced=${syncedCount}, skipped=${skippedCount}, analyzed=${analyzedCount}, summarized=${summarizedCount}, indepth=${indepthCount}`);

      // Delay between batches
      await sleep(2000);
    } catch (err) {
      console.error('  Batch failed:', err?.message || err);
      overall.errors++;
    }

    // Advance cursor by 7 days
    cursor.setDate(cursor.getDate() + 7);
  }

  console.log('\n✅ Seed complete. Summary:');
  console.log(JSON.stringify(overall, null, 2));
}

async function run() {
  const args = process.argv.slice(2);
  if (!args || args.length < 2) {
    usage();
    process.exit(1);
  }

  const start = new Date(args[0]);
  const end = new Date(args[1]);
  const force = args.includes('--force');

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    console.error('Invalid dates provided');
    usage();
    process.exit(1);
  }

  if (start > end) {
    console.error('Start date must be before end date');
    process.exit(1);
  }

  await connectDB();

  try {
    await seedRange(start, end, { force });
  } catch (err) {
    console.error('Seeding failed:', err?.message || err);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
}

if (require.main === module) {
  run();
}

module.exports = { seedRange };
