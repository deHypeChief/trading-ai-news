import { Elysia, t } from 'elysia';
import { Event } from '../models/Event';
import { fetchEconomicEvents, getTodayEvents, getUpcomingHighImpactEvents } from '../services/calendar';
import { analyzeEventRelevance, summarizeTextShort, generateInDepthAnalysis, isGroqRateLimited } from '../services/groq';
import { broadcastEventUpdate } from '../services/websocket';
import { ApiError } from '../utils/errors';
import { fetchNewsForEvent } from '../services/news';

export const calendarRoutes = new Elysia({ prefix: '/calendar' })
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
          minRelevance,
          limit = 100,
          offset = 0,
        } = query as {
          startDate?: string;
          endDate?: string;
          currency?: string;
          impact?: string;
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
        if (!isGroqRateLimited() && (!event.aiAnalyzedAt || event.actual !== externalEvent.actual)) {
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
          } catch (aiError) {
            console.warn(`AI analysis failed for ${externalEvent.title}`);
          }
        } else if (isGroqRateLimited()) {
          console.warn('Groq rate limit active; skipping AI analysis this run');
        }

        // Fetch related news and generate short summary (fallback to description)
        let shortSummary = '';
        if (isGroqRateLimited()) {
          console.warn('Groq rate limit active; skipping AI summary this run');
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
        if (isGroqRateLimited()) {
          console.warn('Groq rate limit active; skipping AI in-depth analysis this run');
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
  });
