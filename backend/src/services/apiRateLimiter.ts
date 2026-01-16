/**
 * Redis-based Rate Limiter for External APIs
 * 
 * Provides distributed rate limiting for:
 * - Genai API (Gemini: ~10 RPM conservative)
 * - ForexFactory (conservative: ~10 RPM to avoid blocks)
 * - News API (based on tier)
 */

import { getRedisClient } from '../config/redis';

// Rate limit configurations
export const RATE_LIMITS = {
  genai: {
    maxRequests: parseInt(process.env.GENAI_RATE_LIMIT_RPM || '10', 10),
    windowMs: 60_000,
    keyPrefix: 'ratelimit:genai',
  },
  forexfactory: {
    maxRequests: parseInt(process.env.FF_RATE_LIMIT_RPM || '10', 10),
    windowMs: 60_000,
    keyPrefix: 'ratelimit:ff',
  },
  news: {
    maxRequests: parseInt(process.env.NEWS_RATE_LIMIT_RPM || '30', 10),
    windowMs: 60_000,
    keyPrefix: 'ratelimit:news',
  },
} as const;

type RateLimitService = keyof typeof RATE_LIMITS;

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterMs: number;
}

/**
 * Check and consume rate limit token (sliding window)
 */
export async function checkRateLimit(service: RateLimitService): Promise<RateLimitResult> {
  const config = RATE_LIMITS[service];
  const redis = getRedisClient();
  
  // Fallback to in-memory if no Redis
  if (!redis) {
    return checkInMemoryRateLimit(service);
  }

  const now = Date.now();
  const windowStart = now - config.windowMs;
  const key = `${config.keyPrefix}:requests`;

  try {
    // Use sorted set for sliding window
    const multi = redis.multi();
    
    // Remove old entries outside the window
    multi.zRemRangeByScore(key, '-inf', windowStart);
    
    // Count current requests in window
    multi.zCard(key);
    
    // Get oldest entry for reset time estimation
    multi.zRange(key, 0, 0, { BY: 'SCORE' });
    
    const results = await multi.exec();
    const currentCount = (results?.[1] as number) || 0;
    const oldestEntry = results?.[2] as string[];
    
    const remaining = Math.max(0, config.maxRequests - currentCount);
    const oldestTime = oldestEntry?.length ? parseInt(oldestEntry[0], 10) : now;
    const resetAt = new Date(oldestTime + config.windowMs);
    
    if (currentCount >= config.maxRequests) {
      const retryAfterMs = Math.max(0, oldestTime + config.windowMs - now);
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfterMs,
      };
    }

    // Add current request to window
    await redis.zAdd(key, { score: now, value: `${now}:${Math.random().toString(36).slice(2)}` });
    await redis.expire(key, Math.ceil(config.windowMs / 1000) + 10);

    return {
      allowed: true,
      remaining: remaining - 1,
      resetAt,
      retryAfterMs: 0,
    };
  } catch (error) {
    console.warn(`Rate limit check failed for ${service}, allowing request:`, error);
    return { allowed: true, remaining: config.maxRequests, resetAt: new Date(now + config.windowMs), retryAfterMs: 0 };
  }
}

/**
 * Get current rate limit status without consuming a token
 */
export async function getRateLimitStatus(service: RateLimitService): Promise<RateLimitResult> {
  const config = RATE_LIMITS[service];
  const redis = getRedisClient();
  
  if (!redis) {
    return getInMemoryRateLimitStatus(service);
  }

  const now = Date.now();
  const windowStart = now - config.windowMs;
  const key = `${config.keyPrefix}:requests`;

  try {
    // Clean up and count
    await redis.zRemRangeByScore(key, '-inf', windowStart);
    const currentCount = await redis.zCard(key);
    const oldestEntries = await redis.zRange(key, 0, 0, { BY: 'SCORE' });
    
    const remaining = Math.max(0, config.maxRequests - currentCount);
    const oldestTime = oldestEntries?.length ? parseInt(oldestEntries[0], 10) : now;
    const resetAt = new Date(oldestTime + config.windowMs);
    const retryAfterMs = remaining === 0 ? Math.max(0, oldestTime + config.windowMs - now) : 0;

    return {
      allowed: remaining > 0,
      remaining,
      resetAt,
      retryAfterMs,
    };
  } catch (error) {
    console.warn(`Rate limit status check failed for ${service}:`, error);
    return { allowed: true, remaining: config.maxRequests, resetAt: new Date(now + config.windowMs), retryAfterMs: 0 };
  }
}

/**
 * Wait for rate limit to reset
 */
export async function waitForRateLimit(service: RateLimitService): Promise<void> {
  const status = await getRateLimitStatus(service);
  
  if (!status.allowed && status.retryAfterMs > 0) {
    console.log(`⏳ Rate limit reached for ${service}, waiting ${Math.ceil(status.retryAfterMs / 1000)}s...`);
    await sleep(status.retryAfterMs + 1000); // Add 1s buffer
  }
}

/**
 * Execute with rate limiting
 */
export async function withRateLimit<T>(
  service: RateLimitService,
  fn: () => Promise<T>,
  retries: number = 3
): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const status = await checkRateLimit(service);
    
    if (!status.allowed) {
      if (attempt < retries - 1) {
        const waitTime = status.retryAfterMs + 1000;
        console.log(`⏳ [${service}] Rate limited, waiting ${Math.ceil(waitTime / 1000)}s (attempt ${attempt + 1}/${retries})`);
        await sleep(waitTime);
        continue;
      }
      throw new Error(`Rate limit exceeded for ${service} after ${retries} retries`);
    }

    try {
      return await fn();
    } catch (error: any) {
      // Check if it's a rate limit error from the API
      const isRateLimit = 
        error?.response?.status === 429 ||
        error?.error?.code === 'rate_limit_exceeded' ||
        error?.code === 'rate_limit_exceeded';

      if (isRateLimit && attempt < retries - 1) {
        // Mark rate limit in Redis
        await markRateLimitHit(service);
        const waitTime = 60_000; // Wait 1 minute on API rate limit
        console.warn(`⚠️ [${service}] API rate limit hit, waiting 60s (attempt ${attempt + 1}/${retries})`);
        await sleep(waitTime);
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Rate limit exceeded for ${service}`);
}

/**
 * Mark that we hit an external rate limit (fills up our window)
 */
async function markRateLimitHit(service: RateLimitService): Promise<void> {
  const config = RATE_LIMITS[service];
  const redis = getRedisClient();
  
  if (!redis) {
    markInMemoryRateLimitHit(service);
    return;
  }

  const now = Date.now();
  const key = `${config.keyPrefix}:requests`;

  try {
    // Fill up the remaining slots to trigger rate limiting
    const currentCount = await redis.zCard(key);
    const toAdd = config.maxRequests - currentCount;
    
    if (toAdd > 0) {
      const entries = Array.from({ length: toAdd }, (_, i) => ({
        score: now,
        value: `${now}:block:${i}:${Math.random().toString(36).slice(2)}`,
      }));
      await redis.zAdd(key, entries);
      await redis.expire(key, Math.ceil(config.windowMs / 1000) + 10);
    }
  } catch (error) {
    console.warn(`Failed to mark rate limit hit for ${service}:`, error);
  }
}

// In-memory fallback
const inMemoryLimits: Record<string, { timestamps: number[] }> = {};

function checkInMemoryRateLimit(service: RateLimitService): RateLimitResult {
  const config = RATE_LIMITS[service];
  const now = Date.now();
  const windowStart = now - config.windowMs;

  if (!inMemoryLimits[service]) {
    inMemoryLimits[service] = { timestamps: [] };
  }

  // Clean old entries
  inMemoryLimits[service].timestamps = inMemoryLimits[service].timestamps.filter(t => t > windowStart);
  
  const currentCount = inMemoryLimits[service].timestamps.length;
  const remaining = Math.max(0, config.maxRequests - currentCount);
  const oldestTime = inMemoryLimits[service].timestamps[0] || now;
  const resetAt = new Date(oldestTime + config.windowMs);
  
  if (currentCount >= config.maxRequests) {
    const retryAfterMs = Math.max(0, oldestTime + config.windowMs - now);
    return { allowed: false, remaining: 0, resetAt, retryAfterMs };
  }

  // Add request
  inMemoryLimits[service].timestamps.push(now);
  
  return { allowed: true, remaining: remaining - 1, resetAt, retryAfterMs: 0 };
}

function getInMemoryRateLimitStatus(service: RateLimitService): RateLimitResult {
  const config = RATE_LIMITS[service];
  const now = Date.now();
  const windowStart = now - config.windowMs;

  if (!inMemoryLimits[service]) {
    return { allowed: true, remaining: config.maxRequests, resetAt: new Date(now + config.windowMs), retryAfterMs: 0 };
  }

  inMemoryLimits[service].timestamps = inMemoryLimits[service].timestamps.filter(t => t > windowStart);
  
  const currentCount = inMemoryLimits[service].timestamps.length;
  const remaining = Math.max(0, config.maxRequests - currentCount);
  const oldestTime = inMemoryLimits[service].timestamps[0] || now;
  const resetAt = new Date(oldestTime + config.windowMs);
  const retryAfterMs = remaining === 0 ? Math.max(0, oldestTime + config.windowMs - now) : 0;

  return { allowed: remaining > 0, remaining, resetAt, retryAfterMs };
}

function markInMemoryRateLimitHit(service: RateLimitService): void {
  const config = RATE_LIMITS[service];
  const now = Date.now();

  if (!inMemoryLimits[service]) {
    inMemoryLimits[service] = { timestamps: [] };
  }

  // Fill up to max
  while (inMemoryLimits[service].timestamps.length < config.maxRequests) {
    inMemoryLimits[service].timestamps.push(now);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get all rate limit statuses
 */
export async function getAllRateLimitStatuses(): Promise<Record<string, RateLimitResult>> {
  const services: RateLimitService[] = ['genai', 'forexfactory', 'news'];
  const statuses: Record<string, RateLimitResult> = {};

  for (const service of services) {
    statuses[service] = await getRateLimitStatus(service);
  }

  return statuses;
}
