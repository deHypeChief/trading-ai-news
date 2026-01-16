const { fetchEconomicEvents } = require('../src/services/calendar');
const { Event } = require('../src/models/Event');
const { analyzeEventRelevance, summarizeTextShort, generateInDepthAnalysis, isGenaiRateLimited } = require('../src/services/genai');
const { runVolatilityEngine } = require('../src/services/volatilityEngine');
const { fetchNewsForEvent } = require('../src/services/news');

async function performQuarterlySync() {
  // Calculate last 3 months and next 3 months
  const now = new Date();
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(now.getMonth() - 3);
  const threeMonthsForward = new Date(now);
  threeMonthsForward.setMonth(now.getMonth() + 3);

  console.log(`📅 [Quarterly Sync] syncing from ${threeMonthsAgo.toISOString()} to ${threeMonthsForward.toISOString()} ...`);

  try {
    const externalEvents = await fetchEconomicEvents(threeMonthsAgo, threeMonthsForward);
    console.log(`✅ Fetched ${externalEvents.length} events`);

    let analyzedCount = 0;
    let genaiLimited = false;

    for (const externalEvent of externalEvents) {
      // Upsert event
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

      // AI analysis if not done
      if (!genaiLimited && !isGenaiRateLimited() && !event.aiAnalyzedAt) {
        try {
          const aiAnalysis = await analyzeEventRelevance({
            title: externalEvent.title,
            description: externalEvent.description,
            currency: externalEvent.currency,
            impact: externalEvent.impact,
            previous: externalEvent.previous,
            forecast: externalEvent.forecast,
            actual: externalEvent.actual,
          });

          await Event.updateOne(
            { eventId: externalEvent.eventId },
            {
              $set: {
                aiRelevanceScore: aiAnalysis.relevanceScore,
                volatilityPrediction: aiAnalysis.volatilityPrediction,
                aiReasoning: aiAnalysis.reasoning,
                tradingRecommendation: aiAnalysis.tradingRecommendation,
                aiAnalyzedAt: new Date(),
              },
            }
          );
          analyzedCount++;
          console.log(`AI analyzed: ${externalEvent.title}`);
        } catch (err) {
          if ((err as any)?.code === 'GENAI_RATE_LIMIT') {
            genaiLimited = true;
            console.warn('GenAI rate limit reached');
          } else {
            console.warn(`AI analysis failed for ${externalEvent.title}:`, err.message);
          }
        }
      }

      // Add other analyses if needed, similar to calendarSync.ts
    }

    console.log(`✅ [Quarterly Sync] completed, analyzed ${analyzedCount} events`);
  } catch (error) {
    console.error('Quarterly sync failed:', error.message);
  }
}

if (require.main === module) {
  performQuarterlySync().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { performQuarterlySync };