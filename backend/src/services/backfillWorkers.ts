/**
 * Backfill Workers
 * 
 * BullMQ workers that process:
 * 1. Event imports (historical data)
 * 2. AI enrichment (analysis, volatility, summary, in-depth)
 * 3. News fetching
 * 
 * Workers respect rate limits and can be paused/resumed.
 */

import { Worker, Job } from 'bullmq';
import { Event } from '../models/Event';
import {
  QUEUE_NAMES,
  EventImportJob,
  AIEnrichmentJob,
  NewsFetchJob,
  addAIEnrichmentJob,
  addNewsFetchJob,
} from './queue';
import {
  consumeGenaiToken,
  setGenaiCooldown,
  waitForGenaiAvailability,
  isGenaiRateLimited,
  getGenaiRateLimitStatus,
} from './genaiRateLimiter';
import { fetchHistoricalEvents } from './historicalFetcher';
import { analyzeEventRelevance, inferVolatility, summarizeTextShort, generateInDepthAnalysis, generateStructuredAnalysis } from './genai';
import { runVolatilityEngine } from './volatilityEngine';
import { fetchNewsForEvent } from './news';

// Worker instances
let eventImportWorker: Worker<EventImportJob> | null = null;
let aiEnrichmentWorker: Worker<AIEnrichmentJob> | null = null;
let newsFetchWorker: Worker<NewsFetchJob> | null = null;

// Statistics
let stats = {
  eventsImported: 0,
  eventsEnriched: 0,
  newsFetched: 0,
  errors: 0,
  rateLimitHits: 0,
};

/**
 * Get Redis connection options for workers
 */
function getRedisConnectionOptions() {
  const redisUrl = process.env.REDIS_URL;
  
  if (redisUrl) {
    try {
      const url = new URL(redisUrl);
      return {
        host: url.hostname,
        port: parseInt(url.port || '6379'),
        password: url.password || undefined,
        db: parseInt(url.pathname.slice(1) || '0'),
      };
    } catch (e) {
      console.warn('Failed to parse REDIS_URL for workers');
    }
  }
  
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
  };
}

/**
 * Process event import job
 */
async function processEventImport(job: Job<EventImportJob>): Promise<any> {
  const { startDate, endDate, source } = job.data;
  
  console.log(`[ImportWorker] Processing import: ${startDate} to ${endDate}`);
  
  try {
    const result = await fetchHistoricalEvents(
      new Date(startDate),
      new Date(endDate),
      { skipExisting: true, source: 'synthetic' }
    );
    
    stats.eventsImported += result.imported;
    
    // Queue AI enrichment for imported events
    if (result.imported > 0) {
      const events = await Event.find({
        eventDateTime: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
        aiAnalyzedAt: { $exists: false },
      }).select('eventId eventDateTime').lean();
      
      for (const event of events) {
        await addAIEnrichmentJob(
          event.eventId,
          event.eventDateTime,
          ['analysis', 'volatility', 'summary', 'indepth']
        );
      }
      
      console.log(`[ImportWorker] Queued ${events.length} events for AI enrichment`);
    }
    
    return {
      success: true,
      ...result,
    };
  } catch (error: any) {
    stats.errors++;
    console.error(`[ImportWorker] Error:`, error.message);
    throw error;
  }
}

/**
 * Process AI enrichment job
 */
async function processAIEnrichment(job: Job<AIEnrichmentJob>): Promise<any> {
  const { eventId, tasks } = job.data;
  
  // Get event from database
  const event = await Event.findOne({ eventId });
  if (!event) {
    console.warn(`[AIWorker] Event not found: ${eventId}`);
    return { success: false, reason: 'Event not found' };
  }
  
  console.log(`[AIWorker] Enriching: ${event.eventName} (${eventId})`);
  
  const results: Record<string, boolean> = {};
  
  // Prepare event input for Genai
  const eventInput = {
    title: event.eventName,
    description: event.description,
    currency: event.currency,
    impact: event.impact,
    previous: event.previous,
    forecast: event.forecast,
    actual: event.actual,
  };
  
  // 1. Basic AI Analysis
  if (tasks.includes('analysis') && !event.aiAnalyzedAt) {
    try {
      // Wait for rate limit availability
      const available = await waitForGenaiAvailability(60000);
      if (!available) {
        throw new Error('GENAI_RATE_LIMIT');
      }
      
      const analysis = await analyzeEventRelevance(eventInput);
      
      await Event.updateOne(
        { eventId },
        {
          $set: {
            aiRelevanceScore: analysis.relevanceScore,
            volatilityPrediction: analysis.volatilityPrediction,
            aiReasoning: analysis.reasoning,
            tradingRecommendation: analysis.tradingRecommendation,
            aiAnalyzedAt: new Date(),
          },
        }
      );
      
      results.analysis = true;
      console.log(`[AIWorker] ✅ Analysis complete for ${event.eventName}`);
    } catch (error: any) {
      results.analysis = false;
      if (error.message === 'GENAI_RATE_LIMIT' || error?.error?.code === 'rate_limit_exceeded') {
        stats.rateLimitHits++;
        await setGenaiCooldown(60000);
        throw error; // Retry later
      }
      console.warn(`[AIWorker] Analysis failed for ${eventId}:`, error.message);
    }
  } else {
    results.analysis = true; // Already done
  }
  
  // 2. Volatility Analysis
  if (tasks.includes('volatility') && !event.volatilityScore) {
    try {
      const available = await waitForGenaiAvailability(60000);
      if (!available) {
        throw new Error('GENAI_RATE_LIMIT');
      }
      
      const regime = process.env.CURRENT_MARKET_REGIME as any;
      const vol = await runVolatilityEngine(eventInput as any, regime);
      
      await Event.updateOne(
        { eventId },
        {
          $set: {
            volatilityScore: vol.volatilityScore,
            volatilityWindow: vol.volatilityWindow,
            expectedPipRange: vol.expectedPipRange,
            directionalBias: vol.directionalBias,
            confidenceScore: vol.confidenceScore,
            drivers: vol.drivers,
            executionNotes: vol.executionNotes,
            currentRegime: regime,
          },
        }
      );
      
      results.volatility = true;
      console.log(`[AIWorker] ✅ Volatility complete for ${event.eventName}`);
    } catch (error: any) {
      results.volatility = false;
      if (error.message === 'GENAI_RATE_LIMIT' || error?.error?.code === 'rate_limit_exceeded') {
        stats.rateLimitHits++;
        await setGenaiCooldown(60000);
        throw error;
      }
      console.warn(`[AIWorker] Volatility failed for ${eventId}:`, error.message);
    }
  } else {
    results.volatility = true;
  }
  
  // 2.5. Structured Analysis for SaaS Dashboard
  if (tasks.includes('structured') && !event.anticipatedVolatility) {
    try {
      const available = await waitForGenaiAvailability(60000);
      if (!available) {
        throw new Error('GENAI_RATE_LIMIT');
      }
      
      const structuredAnalysis = await generateStructuredAnalysis({
        title: eventInput.title,
        description: eventInput.description,
        currency: eventInput.currency,
        impact: eventInput.impact,
        previous: eventInput.previous,
        forecast: eventInput.forecast,
        actual: eventInput.actual,
        newsHeadline: event.newsHeadline || '',
        newsSummary: event.aiSummary || '',
      });
      
      // Only save if not a fallback response
      if (!(structuredAnalysis as any).isFallback) {
        await Event.updateOne(
          { eventId },
          {
            $set: {
              anticipatedVolatility: structuredAnalysis.anticipatedVolatility,
              whatThisMeans: structuredAnalysis.whatThisMeans,
              marketImpact: structuredAnalysis.marketImpact,
              crossAssetImpact: structuredAnalysis.crossAssetImpact,
            },
          }
        );
        results.structured = true;
        console.log(`[AIWorker] ✅ Structured analysis complete for ${event.eventName}`);
      } else {
        console.warn(`[AIWorker] Skipping fallback structured analysis for ${event.eventName}`);
        results.structured = false;
      }
    } catch (error: any) {
      results.structured = false;
      if (error.message === 'GENAI_RATE_LIMIT' || error?.error?.code === 'rate_limit_exceeded') {
        stats.rateLimitHits++;
        await setGenaiCooldown(60000);
        throw error;
      }
      console.warn(`[AIWorker] Structured analysis failed for ${eventId}:`, error.message);
    }
  } else {
    results.structured = true;
  }
  
  // 3. News + Summary
  if (tasks.includes('summary') && !event.aiSummary) {
    try {
      // First try to fetch news
      let newsContent = event.description || '';
      let newsHeadline = event.eventName;
      
      try {
        const news = await fetchNewsForEvent(event.eventName, event.currency, event.eventDateTime);
        if (news) {
          newsContent = news.summaryHint || news.headline || newsContent;
          newsHeadline = news.headline || newsHeadline;
          
          await Event.updateOne(
            { eventId },
            {
              $set: {
                newsHeadline: news.headline,
                newsUrl: news.url,
                newsSource: news.source,
                newsPublishedAt: news.publishedAt ? new Date(news.publishedAt) : undefined,
                newsFetchedAt: new Date(),
              },
            }
          );
        }
      } catch (newsError) {
        console.warn(`[AIWorker] News fetch failed for ${eventId}, using description`);
      }
      
      // Now summarize
      if (newsContent) {
        const available = await waitForGenaiAvailability(60000);
        if (!available) {
          throw new Error('GENAI_RATE_LIMIT');
        }
        
        const summary = await summarizeTextShort(newsContent, newsHeadline);
        
        await Event.updateOne(
          { eventId },
          { $set: { aiSummary: summary.summary } }
        );
        
        results.summary = true;
        console.log(`[AIWorker] ✅ Summary complete for ${event.eventName}`);
      } else {
        results.summary = true; // Nothing to summarize
      }
    } catch (error: any) {
      results.summary = false;
      if (error.message === 'GENAI_RATE_LIMIT' || error?.error?.code === 'rate_limit_exceeded') {
        stats.rateLimitHits++;
        await setGenaiCooldown(60000);
        throw error;
      }
      console.warn(`[AIWorker] Summary failed for ${eventId}:`, error.message);
    }
  } else {
    results.summary = true;
  }
  
  // 4. In-depth Analysis
  if (tasks.includes('indepth') && !event.aiInDepthAnalysis) {
    try {
      const available = await waitForGenaiAvailability(60000);
      if (!available) {
        throw new Error('GENAI_RATE_LIMIT');
      }
      
      const refreshedEvent = await Event.findOne({ eventId }).lean();
      
      const indepth = await generateInDepthAnalysis({
        ...eventInput,
        newsHeadline: refreshedEvent?.newsHeadline,
        newsSummary: refreshedEvent?.aiSummary,
      });
      
      if (indepth) {
        await Event.updateOne(
          { eventId },
          { $set: { aiInDepthAnalysis: indepth } }
        );
      }
      
      results.indepth = true;
      console.log(`[AIWorker] ✅ In-depth complete for ${event.eventName}`);
    } catch (error: any) {
      results.indepth = false;
      if (error.message === 'GENAI_RATE_LIMIT' || error?.error?.code === 'rate_limit_exceeded') {
        stats.rateLimitHits++;
        await setGenaiCooldown(60000);
        throw error;
      }
      console.warn(`[AIWorker] In-depth failed for ${eventId}:`, error.message);
    }
  } else {
    results.indepth = true;
  }
  
  stats.eventsEnriched++;
  
  return {
    success: true,
    eventId,
    results,
  };
}

/**
 * Process news fetch job
 */
async function processNewsFetch(job: Job<NewsFetchJob>): Promise<any> {
  const { eventId, eventTitle, currency, eventDate } = job.data;
  
  try {
    const news = await fetchNewsForEvent(eventTitle, currency, new Date(eventDate));
    
    if (news) {
      await Event.updateOne(
        { eventId },
        {
          $set: {
            newsHeadline: news.headline,
            newsUrl: news.url,
            newsSource: news.source,
            newsPublishedAt: news.publishedAt ? new Date(news.publishedAt) : undefined,
            newsFetchedAt: new Date(),
          },
        }
      );
      
      stats.newsFetched++;
      
      return {
        success: true,
        eventId,
        news,
      };
    }
    
    return {
      success: true,
      eventId,
      news: null,
    };
  } catch (error: any) {
    stats.errors++;
    console.error(`[NewsWorker] Error for ${eventId}:`, error.message);
    throw error;
  }
}

/**
 * Start all workers
 */
export async function startWorkers(options: {
  concurrency?: {
    import?: number;
    ai?: number;
    news?: number;
  };
} = {}): Promise<void> {
  const connection = getRedisConnectionOptions();
  const { concurrency = {} } = options;
  
  // Event Import Worker - can run multiple in parallel
  eventImportWorker = new Worker<EventImportJob>(
    QUEUE_NAMES.EVENT_IMPORT,
    processEventImport,
    {
      connection,
      concurrency: concurrency.import || 3,
      limiter: {
        max: 10,
        duration: 60000, // 10 jobs per minute max
      },
    }
  );
  
  // AI Enrichment Worker - rate limited by Genai
  aiEnrichmentWorker = new Worker<AIEnrichmentJob>(
    QUEUE_NAMES.AI_ENRICHMENT,
    processAIEnrichment,
    {
      connection,
      concurrency: concurrency.ai || 1, // Sequential for rate limiting
      limiter: {
        max: parseInt(process.env.GENAI_RPM_LIMIT || '30', 10),
        duration: 60000,
      },
    }
  );
  
  // News Fetch Worker
  newsFetchWorker = new Worker<NewsFetchJob>(
    QUEUE_NAMES.NEWS_FETCH,
    processNewsFetch,
    {
      connection,
      concurrency: concurrency.news || 2,
      limiter: {
        max: 30,
        duration: 60000,
      },
    }
  );
  
  // Error handlers
  for (const [name, worker] of [
    ['Import', eventImportWorker],
    ['AI', aiEnrichmentWorker],
    ['News', newsFetchWorker],
  ] as const) {
    worker?.on('failed', (job, err) => {
      console.error(`[${name}Worker] Job ${job?.id} failed:`, err.message);
      stats.errors++;
    });
    
    worker?.on('error', (err) => {
      console.error(`[${name}Worker] Error:`, err.message);
    });
  }
  
  console.log('✅ Backfill workers started');
}

/**
 * Stop all workers gracefully
 */
export async function stopWorkers(): Promise<void> {
  await Promise.all([
    eventImportWorker?.close(),
    aiEnrichmentWorker?.close(),
    newsFetchWorker?.close(),
  ]);
  
  eventImportWorker = null;
  aiEnrichmentWorker = null;
  newsFetchWorker = null;
  
  console.log('✅ Backfill workers stopped');
}

/**
 * Pause AI enrichment worker (e.g., during rate limit)
 */
export async function pauseAIWorker(): Promise<void> {
  await aiEnrichmentWorker?.pause();
  console.log('⏸️ AI enrichment worker paused');
}

/**
 * Resume AI enrichment worker
 */
export async function resumeAIWorker(): Promise<void> {
  await aiEnrichmentWorker?.resume();
  console.log('▶️ AI enrichment worker resumed');
}

/**
 * Get worker statistics
 */
export function getWorkerStats() {
  return {
    ...stats,
    workers: {
      import: eventImportWorker ? (eventImportWorker.isPaused() ? 'paused' : 'running') : 'stopped',
      ai: aiEnrichmentWorker ? (aiEnrichmentWorker.isPaused() ? 'paused' : 'running') : 'stopped',
      news: newsFetchWorker ? (newsFetchWorker.isPaused() ? 'paused' : 'running') : 'stopped',
    },
  };
}

/**
 * Reset statistics
 */
export function resetWorkerStats(): void {
  stats = {
    eventsImported: 0,
    eventsEnriched: 0,
    newsFetched: 0,
    errors: 0,
    rateLimitHits: 0,
  };
}
