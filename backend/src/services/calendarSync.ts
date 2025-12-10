import { Event } from '../models/Event';
import { fetchEconomicEvents } from './calendar';
import { analyzeEventRelevance, summarizeTextShort, generateInDepthAnalysis, isGroqRateLimited } from './groq';
import { fetchNewsForEvent } from './news';
import { broadcastEventUpdate } from './websocket';
import { debugConsole } from '../utils/debugConsole';

let timer: NodeJS.Timeout | null = null;
const DEFAULT_SYNC_INTERVAL_HOURS = 6;
const syncIntervalHours = Math.max(
  1,
  parseInt(process.env.CALENDAR_SYNC_INTERVAL_HOURS || `${DEFAULT_SYNC_INTERVAL_HOURS}`, 10)
);
const syncIntervalMs = syncIntervalHours * 60 * 60 * 1000;

async function performCalendarSync(days = 3) {
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + days);

  console.log(`\n📅 [Calendar Sync] syncing ${days} day(s) starting ${startDate.toISOString()} ...`);
  debugConsole.info('CalendarSync', `Starting sync for ${days} day(s)`, { startDate, endDate });

  const externalEvents = await fetchEconomicEvents(startDate, endDate);
  debugConsole.debug('CalendarSync', `Fetched ${externalEvents.length} external events`);
  let syncedCount = 0;
  let analyzedCount = 0;
  let summarizedCount = 0;
  let indepthCount = 0;
  let groqLimited = false;

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

    syncedCount++;
    broadcastEventUpdate(event, 'update');
    debugConsole.debug('CalendarSync', `Synced event: ${externalEvent.title}`);

    // AI analysis if missing or updated
    if (!groqLimited && !isGroqRateLimited() && (!event.aiAnalyzedAt || event.actual !== externalEvent.actual)) {
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
        debugConsole.debug('CalendarSync', `AI analysis completed for ${externalEvent.title}`);
      } catch (err) {
        if ((err as any)?.code === 'GROQ_RATE_LIMIT') {
          groqLimited = true;
          console.warn('[Calendar Sync] Groq rate limit reached; skipping remaining AI work this run');
          debugConsole.warn('CalendarSync', 'Groq rate limit reached');
        } else {
          console.warn(`[Calendar Sync] AI analysis failed for ${externalEvent.title}`);
          debugConsole.error('CalendarSync', `AI analysis failed for ${externalEvent.title}`, err);
        }
      }
    }

    // News + summary (with fallback to description)
    let shortSummary = '';
    if (!groqLimited && !isGroqRateLimited()) {
      try {
        const news = await fetchNewsForEvent(externalEvent.title, externalEvent.currency, externalEvent.date);
        if (news) {
          const summary = await summarizeTextShort(news.summaryHint || news.headline || externalEvent.description || '', news.headline);
          shortSummary = summary.summary;
          await Event.updateOne(
            { eventId: externalEvent.eventId },
            {
              $set: {
                aiSummary: summary.summary,
                newsHeadline: news.headline,
                newsUrl: news.url,
                newsSource: news.source,
                newsPublishedAt: news.publishedAt ? new Date(news.publishedAt) : undefined,
                newsFetchedAt: new Date(),
              },
            }
          );
          summarizedCount++;
          debugConsole.debug('CalendarSync', `Summarized news for ${externalEvent.title}`);
        } else if (externalEvent.description) {
          const summary = await summarizeTextShort(externalEvent.description, externalEvent.title);
          shortSummary = summary.summary;
          await Event.updateOne({ eventId: externalEvent.eventId }, { $set: { aiSummary: summary.summary } });
          summarizedCount++;
          debugConsole.debug('CalendarSync', `Summarized description for ${externalEvent.title}`);
        }
      } catch (err) {
        if ((err as any)?.code === 'GROQ_RATE_LIMIT') {
          groqLimited = true;
          console.warn('[Calendar Sync] Groq rate limit reached; skipping remaining AI work this run');
          debugConsole.warn('CalendarSync', 'Groq rate limit reached during news/summarize');
        } else {
          console.warn(`[Calendar Sync] News/summarize failed for ${externalEvent.title}`);
          debugConsole.error('CalendarSync', `News/summarize failed for ${externalEvent.title}`, err);
        }
      }
    }

    // In-depth analysis
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
          debugConsole.debug('CalendarSync', `In-depth analysis completed for ${externalEvent.title}`);
        }
      } catch (err) {
        if ((err as any)?.code === 'GROQ_RATE_LIMIT') {
          groqLimited = true;
          console.warn('[Calendar Sync] Groq rate limit reached; skipping remaining AI work this run');
          debugConsole.warn('CalendarSync', 'Groq rate limit reached during in-depth analysis');
        } else {
          console.warn(`[Calendar Sync] In-depth analysis failed for ${externalEvent.title}`);
          debugConsole.error('CalendarSync', `In-depth analysis failed for ${externalEvent.title}`, err);
        }
      }
    }
  }

  console.log(`✅ [Calendar Sync] synced ${syncedCount}, analyzed ${analyzedCount}, summarized ${summarizedCount}, indepth ${indepthCount}`);
  debugConsole.info('CalendarSync', 'Sync completed', { syncedCount, analyzedCount, summarizedCount, indepthCount });
}

export function startCalendarSyncScheduler() {
  if (timer) return;

  // Run immediately on startup
  performCalendarSync().catch((err) => console.error('[Calendar Sync] initial run failed:', err));

  // Run every configured interval (default 6 hours)
  timer = setInterval(() => {
    performCalendarSync().catch((err) => console.error('[Calendar Sync] interval run failed:', err));
  }, syncIntervalMs);

  console.log(`⏱️ Calendar sync scheduler started (every ${syncIntervalHours} hour(s))`);
}

export function stopCalendarSyncScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log('🛑 Calendar sync scheduler stopped');
  }
}
