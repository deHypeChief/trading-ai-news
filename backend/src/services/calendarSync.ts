import { Event } from '../models/Event';
import { fetchEconomicEvents } from './calendar';
import { analyzeEventRelevance, summarizeTextShort, generateInDepthAnalysis, isGroqRateLimited } from './groq';
import { runVolatilityEngine } from './volatilityEngine';
import { fetchNewsForEvent } from './news';
import { broadcastEventUpdate } from './websocket';
import { debugConsole } from '../utils/debugConsole';

let timer: NodeJS.Timeout | null = null;
const DEFAULT_SYNC_INTERVAL_HOURS = 6;
const DEFAULT_SYNC_DAYS = 3;
const MAX_SYNC_DAYS = parseInt(process.env.CALENDAR_SYNC_MAX_DAYS || '30', 10);
const syncIntervalHours = Math.max(
  1,
  parseInt(process.env.CALENDAR_SYNC_INTERVAL_HOURS || `${DEFAULT_SYNC_INTERVAL_HOURS}`, 10)
);
// Determine how many days to sync per run (configurable via CALENDAR_SYNC_DAYS)
const syncDaysRaw = Math.max(1, parseInt(process.env.CALENDAR_SYNC_DAYS || `${DEFAULT_SYNC_DAYS}`, 10));
const syncDays = Math.min(syncDaysRaw, MAX_SYNC_DAYS);
if (syncDaysRaw > MAX_SYNC_DAYS) {
  console.warn(`[CalendarSync] CALENDAR_SYNC_DAYS (${syncDaysRaw}) exceeds CALENDAR_SYNC_MAX_DAYS (${MAX_SYNC_DAYS}), capping to ${syncDays}`);
}
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

    // Volatility analysis (structured engine)
    if (!groqLimited && !isGroqRateLimited()) {
      try {
        const regime = process.env.CURRENT_MARKET_REGIME as any;
        const vol = await runVolatilityEngine(externalEvent, regime);

        await Event.updateOne({ eventId: externalEvent.eventId }, {
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
            currentRegime: regime,
          }
        });
        debugConsole.debug('CalendarSync', `Volatility analysis updated for ${externalEvent.title}`);
      } catch (err) {
        if ((err as any)?.code === 'GROQ_RATE_LIMIT') {
          groqLimited = true;
          console.warn('[Calendar Sync] Groq rate limit reached; skipping volatility this run');
        } else {
          console.warn(`[Calendar Sync] Volatility engine failed for ${externalEvent.title}`);
          debugConsole.error('CalendarSync', `Volatility engine failed for ${externalEvent.title}`, err);
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

let backfillTimer: NodeJS.Timeout | null = null;
const BACKFILL_ENABLED = process.env.CALENDAR_BACKFILL_ENABLED === 'true';
const BACKFILL_START_DATE = process.env.CALENDAR_BACKFILL_START_DATE || '2025-12-08';
const BACKFILL_INTERVAL_HOURS = Math.max(1, parseInt(process.env.CALENDAR_BACKFILL_INTERVAL_HOURS || '24', 10));
const backfillIntervalMs = BACKFILL_INTERVAL_HOURS * 60 * 60 * 1000;
const BACKFILL_REDIS_KEY = process.env.CALENDAR_BACKFILL_REDIS_KEY || 'calendar:backfill:cursor';
const BACKFILL_LAST_RUN_REDIS_KEY = process.env.CALENDAR_BACKFILL_LAST_RUN_REDIS_KEY || 'calendar:backfill:last_run';

async function setLastBackfillSummary(summary: any) {
  try {
    const { getRedisClient } = await import('../config/redis');
    const redis = getRedisClient();
    if (!redis) return;
    await redis.set(BACKFILL_LAST_RUN_REDIS_KEY, JSON.stringify(summary));
  } catch (err) {
    console.warn('[Backfill] failed to write last-run summary to redis', err?.message || err);
  }
}

async function getLastBackfillSummary(): Promise<any | null> {
  try {
    const { getRedisClient } = await import('../config/redis');
    const redis = getRedisClient();
    if (!redis) return null;
    const v = await redis.get(BACKFILL_LAST_RUN_REDIS_KEY);
    return v ? JSON.parse(v) : null;
  } catch (err) {
    console.warn('[Backfill] failed to read last-run summary from redis', err?.message || err);
    return null;
  }
}

export function startCalendarSyncScheduler() {
  if (timer) return;

  // Run immediately on startup (syncing configured number of days)
  performCalendarSync(syncDays).catch((err) => console.warn('[Calendar Sync] initial run failed:', err));

  // Run every configured interval (default 6 hours)
  timer = setInterval(() => {
    performCalendarSync(syncDays).catch((err) => console.warn('[Calendar Sync] interval run failed:', err));
  }, syncIntervalMs);

  console.log(`⏱️ Calendar sync scheduler started (every ${syncIntervalHours} hour(s), syncing ${syncDays} day(s) per run)`);

  // Log backfill configuration and optionally start backfill scheduler
  console.log(`🔁 Backfill enabled: ${BACKFILL_ENABLED} (startDate=${BACKFILL_START_DATE}, intervalHours=${BACKFILL_INTERVAL_HOURS}, redisKey=${BACKFILL_REDIS_KEY})`);
  if (BACKFILL_ENABLED) {
    startBackfillScheduler();
  }
}

export function stopCalendarSyncScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log('🛑 Calendar sync scheduler stopped');
  }

  // Stop backfill if running
  stopBackfillScheduler();
}

async function getBackfillCursor(): Promise<Date> {
  try {
    const { getRedisClient } = await import('../config/redis');
    const redis = getRedisClient();
    if (!redis) return new Date(BACKFILL_START_DATE);
    const v = await redis.get(BACKFILL_REDIS_KEY);
    return v ? new Date(v) : new Date(BACKFILL_START_DATE);
  } catch (err) {
    console.warn('[Backfill] failed to read cursor from redis, using default start date', err?.message || err);
    return new Date(BACKFILL_START_DATE);
  }
}

async function setBackfillCursor(d: Date) {
  try {
    const { getRedisClient } = await import('../config/redis');
    const redis = getRedisClient();
    if (!redis) return;
    await redis.set(BACKFILL_REDIS_KEY, d.toISOString());
  } catch (err) {
    console.warn('[Backfill] failed to write cursor to redis', err?.message || err);
  }
}

/**
 * Perform a single backward backfill run. It will fetch events for the range
 * [cursor - (days - 1), cursor] and then move the cursor back by `days`.
 */
export async function performBackfillRun(days = syncDays, opts: { force?: boolean } = {}) {
  const force = !!opts.force;
  const cursor = await getBackfillCursor();

  // Ensure cursor is at the end of the day
  const endDate = new Date(cursor);
  endDate.setHours(23, 59, 59, 999);

  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - Math.max(1, days) + 1);
  startDate.setHours(0, 0, 0, 0);

  console.log(`📅 Generating historical data for ${startDate.toISOString()} -> ${endDate.toISOString()} (force=${force})`);

  try {
    const externalEventsRaw = await fetchEconomicEvents(startDate, endDate);

    // Deduplicate by eventId
    const uniqueEventsMap = new Map<string, any>();
    for (const e of externalEventsRaw) uniqueEventsMap.set(e.eventId, e);
    const externalEvents = Array.from(uniqueEventsMap.values()).sort((a: any, b: any) => a.date.getTime() - b.date.getTime());

    let syncedCount = 0;
    let skippedCount = 0;
    let analyzedCount = 0;
    let summarizedCount = 0;
    let indepthCount = 0;

    for (const externalEvent of externalEvents) {
      // Skip if event exists and not forcing reprocessing
      if (!force) {
        const exists = await Event.findOne({ eventId: externalEvent.eventId }).lean();
        if (exists) {
          skippedCount++;
          continue;
        }
      }

      // Upsert and run same per-event pipeline as generate-range
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

      // AI analysis
      if (!isGroqRateLimited()) {
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

          await Event.updateOne({ eventId: externalEvent.eventId }, {
            $set: {
              aiRelevanceScore: aiAnalysis.relevanceScore,
              volatilityPrediction: aiAnalysis.volatilityPrediction,
              aiReasoning: aiAnalysis.reasoning,
              tradingRecommendation: aiAnalysis.tradingRecommendation,
              aiAnalyzedAt: new Date(),
            }
          });
          analyzedCount++;

          // Volatility
          try {
            const regime = process.env.CURRENT_MARKET_REGIME as any;
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
          } catch (volErr) {
            console.warn(`[Backfill] Volatility engine failed for ${externalEvent.title}`);
          }
        } catch (aiError) {
          console.warn(`[Backfill] AI analysis failed for ${externalEvent.title}`);
        }
      }

      // News + summary
      let shortSummary = '';
      if (!isGroqRateLimited()) {
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
          console.warn(`[Backfill] News fetch/summarize failed for ${externalEvent.title}`);
        }
      }

      // In-depth
      if (!isGroqRateLimited()) {
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
          console.warn(`[Backfill] In-depth analysis failed for ${externalEvent.title}`);
        }
      }
    }

    // Move cursor back by `days` for the next run
    const newCursor = new Date(startDate);
    newCursor.setDate(newCursor.getDate() - 1);

    await setBackfillCursor(newCursor);

    const summary = {
      timestamp: new Date().toISOString(),
      success: true,
      syncedCount,
      skippedCount,
      analyzedCount,
      summarizedCount,
      indepthCount,
      totalFetched: externalEvents.length,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };

    // persist summary
    await setLastBackfillSummary(summary);

    console.log(`✅ [Backfill] completed: synced=${syncedCount}, skipped=${skippedCount}, analyzed=${analyzedCount}, summarized=${summarizedCount}, indepth=${indepthCount}`);

    return summary;
  } catch (err: any) {
    console.error('[Backfill] failed:', err?.message || err);

    const summary = {
      timestamp: new Date().toISOString(),
      success: false,
      error: err?.message || String(err),
    };

    await setLastBackfillSummary(summary);

    throw err;
  }
}

export function startBackfillScheduler() {
  if (backfillTimer) return;

  // Run immediately
  performBackfillRun(syncDays).catch((err) => console.warn('[Backfill] initial run failed:', err));

  backfillTimer = setInterval(() => {
    performBackfillRun(syncDays).catch((err) => console.warn('[Backfill] interval run failed:', err));
  }, backfillIntervalMs);

  console.log(`⏱️ Backfill scheduler started (every ${BACKFILL_INTERVAL_HOURS} hour(s), moving back ${syncDays} day(s) per run)`);
}

export function stopBackfillScheduler() {
  if (backfillTimer) {
    clearInterval(backfillTimer);
    backfillTimer = null;
    console.log('🛑 Backfill scheduler stopped');
  }
}
