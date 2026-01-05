import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { getRedisClient } from '../config/redis';

// Queue names
export const QUEUE_NAMES = {
  EVENT_IMPORT: 'event-import',
  AI_ENRICHMENT: 'ai-enrichment',
  NEWS_FETCH: 'news-fetch',
} as const;

// Job types
export interface EventImportJob {
  type: 'import-week';
  startDate: string; // ISO string
  endDate: string;
  source: 'ForexFactory' | 'TradingEconomics';
}

export interface AIEnrichmentJob {
  type: 'enrich-event';
  eventId: string;
  priority: 'high' | 'medium' | 'low';
  tasks: ('analysis' | 'volatility' | 'summary' | 'indepth')[];
}

export interface NewsFetchJob {
  type: 'fetch-news';
  eventId: string;
  eventTitle: string;
  currency: string;
  eventDate: string;
}

// Queue instances
let eventImportQueue: Queue<EventImportJob> | null = null;
let aiEnrichmentQueue: Queue<AIEnrichmentJob> | null = null;
let newsFetchQueue: Queue<NewsFetchJob> | null = null;

// Queue events for monitoring
let queueEvents: Map<string, QueueEvents> = new Map();

/**
 * Get Redis connection options for BullMQ
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
      console.warn('Failed to parse REDIS_URL for BullMQ');
    }
  }
  
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
  };
}

/**
 * Initialize all queues
 */
export async function initQueues() {
  const connection = getRedisConnectionOptions();
  
  // Default job options
  const defaultJobOptions = {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 5000,
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  };

  // Event Import Queue - for importing historical events
  eventImportQueue = new Queue<EventImportJob>(QUEUE_NAMES.EVENT_IMPORT, {
    connection,
    defaultJobOptions: {
      ...defaultJobOptions,
      attempts: 5, // More retries for network issues
    },
  });

  // AI Enrichment Queue - for AI analysis
  aiEnrichmentQueue = new Queue<AIEnrichmentJob>(QUEUE_NAMES.AI_ENRICHMENT, {
    connection,
    defaultJobOptions: {
      ...defaultJobOptions,
      attempts: 3,
      backoff: {
        type: 'exponential' as const,
        delay: 60000, // Start with 1 minute delay for rate limits
      },
    },
  });

  // News Fetch Queue - for fetching news
  newsFetchQueue = new Queue<NewsFetchJob>(QUEUE_NAMES.NEWS_FETCH, {
    connection,
    defaultJobOptions,
  });

  // Setup queue events for monitoring
  for (const queueName of Object.values(QUEUE_NAMES)) {
    const events = new QueueEvents(queueName, { connection });
    queueEvents.set(queueName, events);
    
    events.on('completed', ({ jobId }) => {
      console.log(`✅ [${queueName}] Job ${jobId} completed`);
    });
    
    events.on('failed', ({ jobId, failedReason }) => {
      console.error(`❌ [${queueName}] Job ${jobId} failed: ${failedReason}`);
    });
  }

  console.log('✅ BullMQ queues initialized');
  
  return {
    eventImportQueue,
    aiEnrichmentQueue,
    newsFetchQueue,
  };
}

/**
 * Get queue instances
 */
export function getQueues() {
  return {
    eventImportQueue,
    aiEnrichmentQueue,
    newsFetchQueue,
  };
}

/**
 * Add event import job
 */
export async function addEventImportJob(
  startDate: Date,
  endDate: Date,
  source: 'ForexFactory' | 'TradingEconomics' = 'ForexFactory',
  priority: number = 0
) {
  if (!eventImportQueue) throw new Error('Queues not initialized');
  
  const job = await eventImportQueue.add(
    'import-week',
    {
      type: 'import-week',
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      source,
    },
    {
      priority,
      jobId: `import-${source}-${startDate.toISOString().split('T')[0]}`,
    }
  );
  
  return job;
}

/**
 * Add AI enrichment job (newest events get higher priority)
 */
export async function addAIEnrichmentJob(
  eventId: string,
  eventDate: Date,
  tasks: AIEnrichmentJob['tasks'] = ['analysis', 'volatility', 'summary', 'indepth']
) {
  if (!aiEnrichmentQueue) throw new Error('Queues not initialized');
  
  // Calculate priority based on date (newer = higher priority = lower number)
  const now = Date.now();
  const eventTime = eventDate.getTime();
  const ageInDays = Math.floor((now - eventTime) / (24 * 60 * 60 * 1000));
  
  // Priority: 0-100 for events within last 30 days, 100+ for older
  let priority: 'high' | 'medium' | 'low';
  let priorityNum: number;
  
  if (ageInDays < 30) {
    priority = 'high';
    priorityNum = ageInDays;
  } else if (ageInDays < 365) {
    priority = 'medium';
    priorityNum = 100 + Math.floor(ageInDays / 7);
  } else {
    priority = 'low';
    priorityNum = 200 + Math.floor(ageInDays / 30);
  }
  
  const job = await aiEnrichmentQueue.add(
    'enrich-event',
    {
      type: 'enrich-event',
      eventId,
      priority,
      tasks,
    },
    {
      priority: priorityNum,
      jobId: `enrich-${eventId}`,
    }
  );
  
  return job;
}

/**
 * Add news fetch job
 */
export async function addNewsFetchJob(
  eventId: string,
  eventTitle: string,
  currency: string,
  eventDate: Date
) {
  if (!newsFetchQueue) throw new Error('Queues not initialized');
  
  const job = await newsFetchQueue.add(
    'fetch-news',
    {
      type: 'fetch-news',
      eventId,
      eventTitle,
      currency,
      eventDate: eventDate.toISOString(),
    },
    {
      jobId: `news-${eventId}`,
    }
  );
  
  return job;
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
  const stats: Record<string, any> = {};
  
  for (const [name, queue] of [
    [QUEUE_NAMES.EVENT_IMPORT, eventImportQueue],
    [QUEUE_NAMES.AI_ENRICHMENT, aiEnrichmentQueue],
    [QUEUE_NAMES.NEWS_FETCH, newsFetchQueue],
  ] as const) {
    if (queue) {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);
      
      stats[name] = { waiting, active, completed, failed, delayed };
    }
  }
  
  return stats;
}

/**
 * Pause all queues
 */
export async function pauseAllQueues() {
  await Promise.all([
    eventImportQueue?.pause(),
    aiEnrichmentQueue?.pause(),
    newsFetchQueue?.pause(),
  ]);
  console.log('⏸️ All queues paused');
}

/**
 * Resume all queues
 */
export async function resumeAllQueues() {
  await Promise.all([
    eventImportQueue?.resume(),
    aiEnrichmentQueue?.resume(),
    newsFetchQueue?.resume(),
  ]);
  console.log('▶️ All queues resumed');
}

/**
 * Clear all jobs from queues
 */
export async function clearAllQueues() {
  await Promise.all([
    eventImportQueue?.obliterate({ force: true }),
    aiEnrichmentQueue?.obliterate({ force: true }),
    newsFetchQueue?.obliterate({ force: true }),
  ]);
  console.log('🗑️ All queues cleared');
}

/**
 * Close all queues gracefully
 */
export async function closeQueues() {
  // Close queue events first
  for (const events of queueEvents.values()) {
    await events.close();
  }
  queueEvents.clear();
  
  // Close queues
  await Promise.all([
    eventImportQueue?.close(),
    aiEnrichmentQueue?.close(),
    newsFetchQueue?.close(),
  ]);
  
  eventImportQueue = null;
  aiEnrichmentQueue = null;
  newsFetchQueue = null;
  
  console.log('✅ BullMQ queues closed');
}
