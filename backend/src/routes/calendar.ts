import { Elysia, t } from 'elysia';
import { Event } from '../models/Event';
import { fetchEconomicEvents, getTodayEvents, getUpcomingHighImpactEvents } from '../services/calendar';
import { analyzeEventRelevance, summarizeTextShort, generateInDepthAnalysis, generateStructuredAnalysis, isGenaiRateLimited, listGenaiModels } from '../services/genai';
import { runVolatilityEngine } from '../services/volatilityEngine';
import { broadcastEventUpdate } from '../services/websocket';
import { ApiError } from '../utils/errors';
import { fetchNewsForEvent } from '../services/news';
import { subscriptionMiddleware } from '../middleware/subscription';
import { getGenaiRateLimitStatus, consumeGenaiToken } from '../services/genaiRateLimiter';

export const calendarRoutes = new Elysia({ prefix: '/calendar' })
  .use(subscriptionMiddleware)
  // Get calendar events with filtering
  .get(
    '/',
    async ({ query }) => {
      try {
        const {
          startDate,
          endDate,
          currency,
          impact,
          country,
          minRelevance,
          limit = 100,
          offset = 0,
        } = query as {
          startDate?: string;
          endDate?: string;
          currency?: string;
          impact?: string;
          country?: string;
          minRelevance?: string;
          limit?: number;
          offset?: number;
        };

        // Build filter query
        const filter: any = {};

        if (startDate || endDate) {
          filter.eventDateTime = {};
          if (startDate) filter.eventDateTime.$gte = new Date(startDate);
          if (endDate) filter.eventDateTime.$lte = new Date(endDate);
        }

        if (currency) {
          filter.currency = currency.toUpperCase();
        }

        if (impact) {
          const impacts = impact.split(',').map(i => 
            i.charAt(0).toUpperCase() + i.slice(1).toLowerCase()
          );
          filter.impact = { $in: impacts };
        }

        // Support country filtering (comma-separated)
        if (country) {
          const countries = country.split(',').map(c => c.trim());
          filter.country = { $in: countries };
        }

        if (minRelevance) {
          filter.aiRelevanceScore = { $gte: parseInt(minRelevance) };
        }

        // Fetch events from database
        const events = await Event.find(filter)
          .sort({ eventDateTime: 1 })
          .skip(offset)
          .limit(limit)
          .lean();

        const total = await Event.countDocuments(filter);

        return {
          statusCode: 200,
          success: true,
          message: 'Calendar events retrieved',
          data: {
            events,
            total,
            limit,
            offset,
          },
        };
      } catch (error: any) {
        return {
          statusCode: 500,
          success: false,
          message: 'Failed to fetch calendar events',
          data: error.message,
        };
      }
    }
  )

  // Get today's events
  .get('/today', async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const events = await Event.find({
        eventDateTime: {
          $gte: today,
          $lt: tomorrow,
        },
      })
        .sort({ eventDateTime: 1 })
        .lean();

      return {
        statusCode: 200,
        success: true,
        message: "Today's events retrieved",
        data: events,
      };
    } catch (error: any) {
      return {
        statusCode: 500,
        success: false,
        message: 'Failed to fetch today\'s events',
        data: error.message,
      };
    }
  })

  // Get upcoming high-impact events (next 48 hours)
  .get('/upcoming-high-impact', async () => {
    try {
      const now = new Date();
      const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      const events = await Event.find({
        eventDateTime: {
          $gte: now,
          $lte: in48Hours,
        },
        impact: 'High',
      })
        .sort({ eventDateTime: 1 })
        .limit(20)
        .lean();

      return {
        statusCode: 200,
        success: true,
        message: 'Upcoming high-impact events retrieved',
        data: events,
      };
    } catch (error: any) {
      return {
        statusCode: 500,
        success: false,
        message: 'Failed to fetch upcoming events',
        data: error.message,
      };
    }
  })

  // Get single event details
  .get(
    '/:eventId',
    async ({ params }) => {
      try {
        const { eventId } = params;

        // Try external eventId first, then fallback to Mongo _id if valid
        let event = await Event.findOne({ eventId }).lean();

        if (!event && Event.db?.base?.Types?.ObjectId?.isValid?.(eventId)) {
          event = await Event.findById(eventId).lean();
        }

        if (!event) {
          return {
            statusCode: 404,
            success: false,
            message: 'Event not found',
            data: null,
          };
        }

        return {
          statusCode: 200,
          success: true,
          message: 'Event details retrieved',
          data: event,
        };
      } catch (error: any) {
        return {
          statusCode: 500,
          success: false,
          message: 'Failed to fetch event details',
          data: error.message,
        };
      }
    }
  )

  // Sync calendar data (admin/cron job)
  .post('/sync', async ({ query }) => {
    try {
      const { days = 7 } = query as { days?: number };

      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + days);

      console.log(`📅 Syncing calendar data for ${days} days...`);

      // Fetch from external API
      const externalEvents = await fetchEconomicEvents(startDate, endDate);

      let syncedCount = 0;
      let analyzedCount = 0;
      let summarizedCount = 0;
      let indepthCount = 0;

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

        // Broadcast new/updated event to WebSocket clients
        broadcastEventUpdate(event, 'update');

        // Analyze with AI if not already analyzed or if data changed
        if (!isGenaiRateLimited() && (!event.aiAnalyzedAt || event.actual !== externalEvent.actual)) {
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

            // Run structured volatility engine (memory + regime adjustments)
            try {
              const regime = process.env.CURRENT_MARKET_REGIME as any; // optional global regime
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
            } catch (volErr) {
              console.warn(`Volatility engine failed for ${externalEvent.title}`);
            }

            // Generate structured analysis for SaaS dashboard
            try {
              const structuredAnalysis = await generateStructuredAnalysis({
                title: externalEvent.title,
                description: externalEvent.description,
                currency: externalEvent.currency,
                impact: externalEvent.impact,
                previous: externalEvent.previous,
                forecast: externalEvent.forecast,
                actual: externalEvent.actual,
                newsHeadline: '', // Will be populated later if news is fetched
                newsSummary: '',
              });

              // Only save if not a fallback response
              if (!(structuredAnalysis as any).isFallback) {
                await Event.updateOne(
                  { eventId: externalEvent.eventId },
                  {
                    $set: {
                      anticipatedVolatility: structuredAnalysis.anticipatedVolatility,
                      whatThisMeans: structuredAnalysis.whatThisMeans,
                      marketImpact: structuredAnalysis.marketImpact,
                      crossAssetImpact: structuredAnalysis.crossAssetImpact,
                    },
                  }
                );
              }
            } catch (structuredErr) {
              console.warn(`Structured analysis failed for ${externalEvent.title}`);
            }
          } catch (aiError) {
            console.warn(`AI analysis failed for ${externalEvent.title}`);
          }
        } else if (isGenaiRateLimited()) {
          console.warn('Genai rate limit active; skipping AI analysis this run');
        }

        // Fetch related news and generate short summary (fallback to description)
        let shortSummary = '';
        if (isGenaiRateLimited()) {
          console.warn('Genai rate limit active; skipping AI summary this run');
        } else {
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
            } else if (externalEvent.description) {
              const summary = await summarizeTextShort(externalEvent.description, externalEvent.title);
              shortSummary = summary.summary;
              await Event.updateOne({ eventId: externalEvent.eventId }, { $set: { aiSummary: summary.summary } });
              summarizedCount++;
            }
          } catch (err) {
            console.warn(`News fetch/summarize failed for ${externalEvent.title}`);
          }
        }

        // In-depth analysis (medium length)
        if (isGenaiRateLimited()) {
          console.warn('Genai rate limit active; skipping AI in-depth analysis this run');
        } else {
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
            console.warn(`In-depth analysis failed for ${externalEvent.title}`);
          }
        }
      }

      console.log(`✅ Synced ${syncedCount} events, analyzed ${analyzedCount} with AI, summarized ${summarizedCount} events, indepth ${indepthCount}`);

      return {
        statusCode: 200,
        success: true,
        message: 'Calendar synchronized successfully',
        data: {
          syncedCount,
          analyzedCount,
          summarizedCount,
          dateRange: {
            start: startDate,
            end: endDate,
          },
        },
      };
    } catch (error: any) {
      console.error('Calendar sync failed:', error);
      return {
        statusCode: 500,
        success: false,
        message: 'Calendar sync failed',
        data: error.message,
      };
    }
  })

  // Generate historical data over a month range and run AI analysis (admin)
  .post('/generate-range', async ({ body }) => {
    try {
      const { startMonth, months = 1, startDate: sd, endDate: ed, force = false } = body as any;

      let start: Date;
      let end: Date;

      if (startMonth) {
        const parts = startMonth.split('-').map((p: string) => parseInt(p, 10));
        if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) {
          return { statusCode: 400, success: false, message: 'Invalid startMonth format. Use YYYY-MM', data: null };
        }
        start = new Date(parts[0], parts[1] - 1, 1);
        end = new Date(start);
        end.setMonth(end.getMonth() + Math.max(1, parseInt(`${months}`, 10)));
        end.setDate(end.getDate() - 1);
        end.setHours(23, 59, 59, 999);
      } else if (sd && ed) {
        start = new Date(sd);
        end = new Date(ed);
      } else {
        return { statusCode: 400, success: false, message: 'Provide startMonth+months or startDate+endDate', data: null };
      }

      console.log(`📅 Generating calendar data from ${start.toISOString()} to ${end.toISOString()} (force=${!!force})`);

      const externalEventsRaw = await fetchEconomicEvents(start, end);

      // Deduplicate by eventId to avoid repeating the same external events
      const uniqueEventsMap = new Map<string, any>();
      for (const e of externalEventsRaw) {
        uniqueEventsMap.set(e.eventId, e);
      }
      const externalEvents = Array.from(uniqueEventsMap.values()).sort((a: any, b: any) => a.date.getTime() - b.date.getTime());

      let syncedCount = 0;
      let skippedCount = 0;
      let analyzedCount = 0;
      let summarizedCount = 0;
      let indepthCount = 0;

      for (const externalEvent of externalEvents) {
        // Skip existing event unless force is true
        if (!force) {
          const exists = await Event.findOne({ eventId: externalEvent.eventId }).lean();
          if (exists) {
            skippedCount++;
            continue;
          }
        }

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

        // AI analysis if not rate limited
        if (!isGenaiRateLimited()) {
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

            // Volatility engine
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
            } catch (volErr) {
              console.warn(`Volatility engine failed for ${externalEvent.title}`);
            }

            // Generate structured analysis for SaaS dashboard
            try {
              const structuredAnalysis = await generateStructuredAnalysis({
                title: externalEvent.title,
                description: externalEvent.description,
                currency: externalEvent.currency,
                impact: externalEvent.impact,
                previous: externalEvent.previous,
                forecast: externalEvent.forecast,
                actual: externalEvent.actual,
                newsHeadline: '', // Will be populated later if news is fetched
                newsSummary: '',
              });

              // Only save if not a fallback response
              if (!(structuredAnalysis as any).isFallback) {
                await Event.updateOne(
                  { eventId: externalEvent.eventId },
                  {
                    $set: {
                      anticipatedVolatility: structuredAnalysis.anticipatedVolatility,
                      whatThisMeans: structuredAnalysis.whatThisMeans,
                      marketImpact: structuredAnalysis.marketImpact,
                      crossAssetImpact: structuredAnalysis.crossAssetImpact,
                    },
                  }
                );
              }
            } catch (structuredErr) {
              console.warn(`Structured analysis failed for ${externalEvent.title}`);
            }
          } catch (aiError) {
            console.warn(`AI analysis failed for ${externalEvent.title}`);
          }
        } else {
          console.warn('Genai rate limit active; skipping AI analysis for this event');
        }

        // News + summary
        let shortSummary = '';
        if (isGenaiRateLimited()) {
          console.warn('GenAI rate limit active; skipping AI summary this run');
        } else {
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
            } else if (externalEvent.description) {
              const summary = await summarizeTextShort(externalEvent.description, externalEvent.title);
              shortSummary = summary.summary;
              await Event.updateOne({ eventId: externalEvent.eventId }, { $set: { aiSummary: summary.summary } });
              summarizedCount++;
            }
          } catch (err) {
            console.warn(`News fetch/summarize failed for ${externalEvent.title}`);
          }
        }

        // In-depth analysis
        if (isGenaiRateLimited()) {
          console.warn('GenAI rate limit active; skipping AI in-depth analysis this run');
        } else {
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
            console.warn(`In-depth analysis failed for ${externalEvent.title}`);
          }
        }
      }

      return {
        statusCode: 200,
        success: true,
        message: 'Generation completed',
        data: {
          syncedCount,
          skippedCount,
          analyzedCount,
          summarizedCount,
          indepthCount,
          totalFetched: externalEvents.length,
          dateRange: { start, end },
        },
      };
    } catch (error: any) {
      console.error('Generation failed:', error);
      return { statusCode: 500, success: false, message: 'Generation failed', data: error.message };
    }
  })

  // Backfill control endpoints (admin)
  .get('/backfill/status', async ({ set }) => {
    try {
      const { getRedisClient } = await import('../config/redis');
      const redis = getRedisClient();
      const key = process.env.CALENDAR_BACKFILL_REDIS_KEY || 'calendar:backfill:cursor';
      const v = redis ? await redis.get(key) : null;
      return { statusCode: 200, success: true, message: 'Backfill status', data: { enabled: process.env.CALENDAR_BACKFILL_ENABLED === 'true', cursor: v || null, startDate: process.env.CALENDAR_BACKFILL_START_DATE || '2025-12-08' } };
    } catch (err: any) {
      console.error('Backfill status failed:', err);
      set.status = 500;
      return { statusCode: 500, success: false, message: 'Failed to get backfill status', data: err.message };
    }
  })

  .post('/backfill/run-now', async ({ body, set }) => {
    try {
      const { days, force } = body as { days?: number; force?: boolean };
      const run = await import('../services/calendarSync');
      const result = await run.performBackfillRun(days || undefined, { force: !!force });
      return { statusCode: 200, success: true, message: 'Backfill run completed', data: result };
    } catch (err: any) {
      console.error('Backfill run failed:', err);
      set.status = 500;
      return { statusCode: 500, success: false, message: 'Backfill run failed', data: err.message };
    }
  })

  .post('/backfill/reset', async ({ body, set }) => {
    try {
      const { cursorDate } = body as { cursorDate?: string };
      const { getRedisClient } = await import('../config/redis');
      const redis = getRedisClient();
      const key = process.env.CALENDAR_BACKFILL_REDIS_KEY || 'calendar:backfill:cursor';

      const d = cursorDate ? new Date(cursorDate) : new Date(process.env.CALENDAR_BACKFILL_START_DATE || '2025-12-08');
      if (redis) await redis.set(key, d.toISOString());

      return { statusCode: 200, success: true, message: 'Backfill cursor reset', data: { cursor: d.toISOString() } };
    } catch (err: any) {
      console.error('Backfill reset failed:', err);
      set.status = 500;
      return { statusCode: 500, success: false, message: 'Backfill reset failed', data: err.message };
    }
  })

  .get('/backfill/last-run', async ({ set }) => {
    try {
      const { getRedisClient } = await import('../config/redis');
      const redis = getRedisClient();
      const key = process.env.CALENDAR_BACKFILL_LAST_RUN_REDIS_KEY || 'calendar:backfill:last_run';
      if (!redis) return { statusCode: 200, success: true, message: 'Last backfill run', data: null };
      const v = await redis.get(key);
      const parsed = v ? JSON.parse(v) : null;
      return { statusCode: 200, success: true, message: 'Last backfill run', data: parsed };
    } catch (err: any) {
      console.error('Failed to fetch last backfill run:', err);
      set.status = 500;
      return { statusCode: 500, success: false, message: 'Failed to fetch last backfill run', data: err.message };
    }
  })

  // Trigger volatility analysis for a single event
  .post('/:eventId/analyze-volatility', async ({ params, body }) => {
    try {
      const { eventId } = params;
      const regime = (body && (body.regime as string)) || process.env.CURRENT_MARKET_REGIME;

      let event = await Event.findOne({ eventId }).lean();
      if (!event && Event.db?.base?.Types?.ObjectId?.isValid?.(eventId)) {
        event = await Event.findById(eventId).lean();
      }

      if (!event) {
        return { statusCode: 404, success: false, message: 'Event not found', data: null };
      }

      const vol = await runVolatilityEngine(event, regime as any);

      await Event.updateOne({ eventId: event.eventId }, {
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

      // broadcast update to websocket clients
      broadcastEventUpdate(vol, 'volatility_update');

      return { statusCode: 200, success: true, message: 'Volatility analysis complete', data: vol };
    } catch (error: any) {
      console.error('Volatility analysis failed:', error);
      return { statusCode: 500, success: false, message: 'Volatility analysis failed', data: error.message };
    }
  })

  // Generate structured AI analysis for a single event (on-demand)
  .post('/:eventId/generate-analysis', async ({ params, set }) => {
    try {
      const { eventId } = params;

      // Try to consume a token - this checks and decrements rate limit
      const tokenConsumed = await consumeGenaiToken();
      if (!tokenConsumed) {
        set.status = 429;
        return {
          statusCode: 429,
          success: false,
          message: 'AI service is temporarily rate limited. Please try again later.',
          data: null,
        };
      }

      // Find the event
      let event = await Event.findOne({ eventId }).lean();
      if (!event && Event.db?.base?.Types?.ObjectId?.isValid?.(eventId)) {
        event = await Event.findById(eventId).lean();
      }

      if (!event) {
        set.status = 404;
        return {
          statusCode: 404,
          success: false,
          message: 'Event not found',
          data: null,
        };
      }

      // Check if analysis already exists
      if (event.whatThisMeans && event.marketImpact && event.crossAssetImpact) {
        return {
          statusCode: 200,
          success: true,
          message: 'Analysis already exists',
          data: {
            anticipatedVolatility: event.anticipatedVolatility,
            whatThisMeans: event.whatThisMeans,
            marketImpact: event.marketImpact,
            crossAssetImpact: event.crossAssetImpact,
          },
        };
      }

      // Generate structured analysis
      const analysis = await generateStructuredAnalysis({
        title: event.eventName || (event as any).title,
        description: event.description,
        currency: event.currency,
        impact: event.impact,
        previous: event.previous,
        forecast: event.forecast,
        actual: event.actual,
        newsHeadline: event.newsHeadline,
        newsSummary: event.aiSummary,
      });

      // Don't save fallback data to DB - only save real AI analysis
      if ((analysis as any).isFallback) {
        return {
          statusCode: 503,
          success: false,
          message: 'AI analysis temporarily unavailable, showing existing data',
          data: {
            anticipatedVolatility: event.anticipatedVolatility,
            whatThisMeans: event.whatThisMeans || event.aiReasoning,
            marketImpact: event.marketImpact || event.tradingRecommendation,
            crossAssetImpact: event.crossAssetImpact || event.aiInDepthAnalysis,
          },
        };
      }

      // Update the event in database (only with real AI data)
      const updateQuery = event.eventId ? { eventId: event.eventId } : { _id: event._id };
      await Event.updateOne(updateQuery, {
        $set: {
          anticipatedVolatility: analysis.anticipatedVolatility,
          whatThisMeans: analysis.whatThisMeans,
          marketImpact: analysis.marketImpact,
          crossAssetImpact: analysis.crossAssetImpact,
        },
      });

      // Fetch updated event
      const updatedEvent = await Event.findOne(updateQuery).lean();

      return {
        statusCode: 200,
        success: true,
        message: 'Structured analysis generated successfully',
        data: updatedEvent,
      };
    } catch (error: any) {
      console.error('Structured analysis generation failed:', error?.message || error?.code || error);
      
      // Handle rate limit error - return existing data without updating DB
      if (error?.code === 'GENAI_RATE_LIMIT') {
        set.status = 429;
        const event = await Event.findOne(
          params.eventId.includes('_') 
            ? { eventId: params.eventId } 
            : { _id: params.eventId }
        ).lean();
        
        return {
          statusCode: 429,
          success: false,
          message: 'AI rate limit reached. Try again in 60 seconds.',
          data: event ? {
            anticipatedVolatility: event.anticipatedVolatility,
            whatThisMeans: event.whatThisMeans || event.aiReasoning,
            marketImpact: event.marketImpact || event.tradingRecommendation,
            crossAssetImpact: event.crossAssetImpact || event.aiInDepthAnalysis,
          } : null,
        };
      }
      
      set.status = 500;
      return {
        statusCode: 500,
        success: false,
        message: 'Failed to generate analysis',
        data: error.message,
      };
    }
  })

  // Get available currencies
  .get('/meta/currencies', async () => {
    try {
      const currencies = await Event.distinct('currency');

      return {
        statusCode: 200,
        success: true,
        message: 'Available currencies retrieved',
        data: currencies.sort(),
      };
    } catch (error: any) {
      return {
        statusCode: 500,
        success: false,
        message: 'Failed to fetch currencies',
        data: error.message,
      };
    }
  })

  // Get available countries
  .get('/meta/countries', async () => {
    try {
      const countries = await Event.distinct('country');

      return {
        statusCode: 200,
        success: true,
        message: 'Available countries retrieved',
        data: countries.sort(),
      };
    } catch (error: any) {
      return {
        statusCode: 500,
        success: false,
        message: 'Failed to fetch countries',
        data: error.message,
      };
    }
  })

  // Get GenAI rate limiter status
  .get('/genai-status', async () => {
    try {
      const status = await getGenaiRateLimitStatus();

      return {
        statusCode: 200,
        success: true,
        message: 'GenAI rate limiter status retrieved',
        data: {
          remainingTokens: status.remainingTokens,
          maxTokens: status.maxTokens,
          isLimited: status.isLimited,
          cooldownUntil: status.cooldownUntil,
          cooldownRemainingMs: status.cooldownUntil ? Math.max(0, status.cooldownUntil - Date.now()) : null,
        },
      };
    } catch (error: any) {
      return {
        statusCode: 500,
        success: false,
        message: 'Failed to fetch GenAI rate limiter status',
        data: error.message,
      };
    }
  })

  // Get available GenAI models (useful when a model is not found)
  .get('/genai-models', async () => {
    try {
      const models = await listGenaiModels();
      return {
        statusCode: 200,
        success: true,
        message: 'GenAI models retrieved',
        data: models,
      };
    } catch (error: any) {
      return {
        statusCode: 500,
        success: false,
        message: 'Failed to fetch GenAI models',
        data: (error as any)?.message || error,
      };
    }
  });
