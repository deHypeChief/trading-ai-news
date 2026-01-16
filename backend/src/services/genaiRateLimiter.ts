/**
 * Redis-based Google Gemini Rate Limiter
 *
 * Uses a sliding window algorithm with token bucket for Google Gemini tier.
 * Free tier allows ~15 RPM, paid tier higher; we'll be conservative with ~10 RPM
 * to account for bursts and ensure smooth operation.
 */

import { getRedisClient } from '../config/redis';

// Configuration
const GENAI_RATE_LIMIT_KEY = 'genai:rate:tokens';
const GENAI_RATE_LIMIT_WINDOW_KEY = 'genai:rate:window';
const GENAI_COOLDOWN_KEY = 'genai:rate:cooldown';

// Conservative limits (adjust based on tier)
// Google free tier is ~15 RPM; adjust with env vars: GENAI_RPM_LIMIT, GENAI_MIN_DELAY_MS
const MAX_REQUESTS_PER_MINUTE = parseInt(process.env.GENAI_RPM_LIMIT || '15', 10);
const WINDOW_SIZE_MS = 60 * 1000; // 1 minute
const MIN_DELAY_BETWEEN_REQUESTS_MS = parseInt(process.env.GENAI_MIN_DELAY_MS || '4000', 10); // 4s = ~15 RPM max

// In-memory fallback when Redis is unavailable
let inMemoryTokens = MAX_REQUESTS_PER_MINUTE;
let inMemoryLastRefill = Date.now();
let inMemoryLastRequest = 0;
let inMemoryCooldownUntil = 0;

/**
 * Refill tokens based on time elapsed (token bucket algorithm)
 */
function refillInMemoryTokens() {
  const now = Date.now();
  const elapsed = now - inMemoryLastRefill;
  const tokensToAdd = Math.floor((elapsed / WINDOW_SIZE_MS) * MAX_REQUESTS_PER_MINUTE);

  if (tokensToAdd > 0) {
    inMemoryTokens = Math.min(MAX_REQUESTS_PER_MINUTE, inMemoryTokens + tokensToAdd);
    inMemoryLastRefill = now;
  }
}

/**
 * Check if Google Gemini is currently rate limited
 */
export async function isGenaiRateLimited(): Promise<boolean> {
  try {
    const redis = getRedisClient();

    if (!redis) {
      // In-memory fallback
      refillInMemoryTokens();
      if (inMemoryCooldownUntil > Date.now()) return true;
      return inMemoryTokens <= 0;
    }

    // Check cooldown first
    const cooldownUntil = await redis.get(GENAI_COOLDOWN_KEY);
    if (cooldownUntil && parseInt(cooldownUntil) > Date.now()) {
      return true;
    }

    // Check available tokens
    const tokens = await redis.get(GENAI_RATE_LIMIT_KEY);
    return tokens !== null && parseInt(tokens) <= 0;
  } catch (error) {
    console.warn('[GenaiRateLimiter] Error checking rate limit:', error);
    return false; // Fail open
  }
}

/**
 * Get remaining tokens and cooldown info
 */
export async function getGenaiRateLimitStatus(): Promise<{
  remainingTokens: number;
  maxTokens: number;
  cooldownUntil: number | null;
  isLimited: boolean;
}> {
  try {
    const redis = getRedisClient();

    if (!redis) {
      refillInMemoryTokens();
      return {
        remainingTokens: inMemoryTokens,
        maxTokens: MAX_REQUESTS_PER_MINUTE,
        cooldownUntil: inMemoryCooldownUntil > Date.now() ? inMemoryCooldownUntil : null,
        isLimited: inMemoryTokens <= 0 || inMemoryCooldownUntil > Date.now(),
      };
    }

    const [tokens, cooldown] = await Promise.all([
      redis.get(GENAI_RATE_LIMIT_KEY),
      redis.get(GENAI_COOLDOWN_KEY),
    ]);

    const remainingTokens = tokens ? parseInt(tokens) : MAX_REQUESTS_PER_MINUTE;
    const cooldownUntil = cooldown ? parseInt(cooldown) : null;

    return {
      remainingTokens,
      maxTokens: MAX_REQUESTS_PER_MINUTE,
      cooldownUntil: cooldownUntil && cooldownUntil > Date.now() ? cooldownUntil : null,
      isLimited: remainingTokens <= 0 || (cooldownUntil !== null && cooldownUntil > Date.now()),
    };
  } catch (error) {
    console.warn('[GenaiRateLimiter] Error getting status:', error);
    return {
      remainingTokens: MAX_REQUESTS_PER_MINUTE,
      maxTokens: MAX_REQUESTS_PER_MINUTE,
      cooldownUntil: null,
      isLimited: false,
    };
  }
}

/**
 * Consume a token before making a Google Gemini API call
 * Returns true if allowed, false if rate limited
 */
export async function consumeGenaiToken(): Promise<boolean> {
  try {
    const redis = getRedisClient();

    if (!redis) {
      // In-memory fallback
      refillInMemoryTokens();

      if (inMemoryCooldownUntil > Date.now()) return false;
      if (inMemoryTokens <= 0) return false;

      // Enforce minimum delay
      const timeSinceLastRequest = Date.now() - inMemoryLastRequest;
      if (timeSinceLastRequest < MIN_DELAY_BETWEEN_REQUESTS_MS) {
        return false;
      }

      inMemoryTokens--;
      inMemoryLastRequest = Date.now();
      return true;
    }

    // Check cooldown
    const cooldownUntil = await redis.get(GENAI_COOLDOWN_KEY);
    if (cooldownUntil && parseInt(cooldownUntil) > Date.now()) {
      return false;
    }

    // Use Lua script for atomic token decrement
    const luaScript = `
      local key = KEYS[1]
      local windowKey = KEYS[2]
      local maxTokens = tonumber(ARGV[1])
      local windowMs = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      local minDelay = tonumber(ARGV[4])

      -- Get current state
      local tokens = tonumber(redis.call('GET', key)) or maxTokens
      local lastWindow = tonumber(redis.call('GET', windowKey)) or 0

      -- Calculate tokens to refill based on elapsed time
      local elapsed = now - lastWindow
      local tokensToAdd = math.floor((elapsed / windowMs) * maxTokens)

      if tokensToAdd > 0 then
        tokens = math.min(maxTokens, tokens + tokensToAdd)
        redis.call('SET', windowKey, now)
      end

      -- Check if we have tokens
      if tokens <= 0 then
        redis.call('SET', key, tokens)
        redis.call('EXPIRE', key, 120)
        return 0
      end

      -- Consume token
      tokens = tokens - 1
      redis.call('SET', key, tokens)
      redis.call('EXPIRE', key, 120)
      redis.call('EXPIRE', windowKey, 120)

      return 1
    `;

    const result = await redis.eval(luaScript, {
      keys: [GENAI_RATE_LIMIT_KEY, GENAI_RATE_LIMIT_WINDOW_KEY],
      arguments: [
        MAX_REQUESTS_PER_MINUTE.toString(),
        WINDOW_SIZE_MS.toString(),
        Date.now().toString(),
        MIN_DELAY_BETWEEN_REQUESTS_MS.toString(),
      ],
    });

    return result === 1;
  } catch (error) {
    console.warn('[GenaiRateLimiter] Error consuming token:', error);
    return true; // Fail open
  }
}

/**
 * Set a cooldown period after receiving a rate limit error from Google Gemini
 */
export async function setGenaiCooldown(durationMs: number = 60000): Promise<void> {
  const cooldownUntil = Date.now() + durationMs;

  try {
    const redis = getRedisClient();

    if (!redis) {
      inMemoryCooldownUntil = cooldownUntil;
      console.warn(`[GenaiRateLimiter] Cooldown set for ${durationMs}ms (in-memory)`);
      return;
    }

    await redis.set(GENAI_COOLDOWN_KEY, cooldownUntil.toString());
    await redis.expire(GENAI_COOLDOWN_KEY, Math.ceil(durationMs / 1000) + 10);

    console.warn(`[GenaiRateLimiter] Cooldown set for ${durationMs}ms`);
  } catch (error) {
    console.warn('[GenaiRateLimiter] Error setting cooldown:', error);
    inMemoryCooldownUntil = cooldownUntil;
  }
}

/**
 * Clear the cooldown (e.g., after manual intervention)
 */
export async function clearGenaiCooldown(): Promise<void> {
  try {
    const redis = getRedisClient();

    if (!redis) {
      inMemoryCooldownUntil = 0;
      return;
    }

    await redis.del(GENAI_COOLDOWN_KEY);
    console.log('[GenaiRateLimiter] Cooldown cleared');
  } catch (error) {
    console.warn('[GenaiRateLimiter] Error clearing cooldown:', error);
  }
}

/**
 * Reset rate limiter (for testing/manual intervention)
 */
export async function resetGenaiRateLimiter(): Promise<void> {
  try {
    const redis = getRedisClient();

    if (!redis) {
      inMemoryTokens = MAX_REQUESTS_PER_MINUTE;
      inMemoryLastRefill = Date.now();
      inMemoryLastRequest = 0;
      inMemoryCooldownUntil = 0;
      return;
    }

    await Promise.all([
      redis.del(GENAI_RATE_LIMIT_KEY),
      redis.del(GENAI_RATE_LIMIT_WINDOW_KEY),
      redis.del(GENAI_COOLDOWN_KEY),
    ]);

    console.log('[GenaiRateLimiter] Rate limiter reset');
  } catch (error) {
    console.warn('[GenaiRateLimiter] Error resetting:', error);
  }
}

/**
 * Wait until rate limit allows a request (with timeout)
 */
export async function waitForGenaiAvailability(timeoutMs: number = 120000): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const canProceed = await consumeGenaiToken();
    if (canProceed) return true;

    // Get status to determine wait time
    const status = await getGenaiRateLimitStatus();

    let waitTime: number;
    if (status.cooldownUntil) {
      waitTime = Math.min(status.cooldownUntil - Date.now(), 5000);
    } else if (status.remainingTokens <= 0) {
      // Wait for token refill (~6s per token at 10 RPM)
      waitTime = MIN_DELAY_BETWEEN_REQUESTS_MS;
    } else {
      waitTime = MIN_DELAY_BETWEEN_REQUESTS_MS;
    }

    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  return false;
}

/**
 * Decorator/wrapper for rate-limited Google Gemini calls
 */
export async function withGenaiRateLimit<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    onRateLimit?: () => void;
  } = {}
): Promise<T> {
  const { maxRetries = 3, onRateLimit } = options;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Wait for availability
    const available = await waitForGenaiAvailability(30000);
    if (!available) {
      throw new Error('Google Gemini rate limit timeout - unable to get token');
    }

    try {
      return await fn();
    } catch (error: any) {
      const code = error?.code || error?.status;

      if (code === 429 || code === 'RESOURCE_EXHAUSTED') {
        console.warn(`[GenaiRateLimiter] Rate limit hit on attempt ${attempt + 1}/${maxRetries}`);
        onRateLimit?.();

        // Progressive cooldown
        const cooldownMs = Math.min(60000 * Math.pow(2, attempt), 300000); // 1min, 2min, 4min max 5min
        await setGenaiCooldown(cooldownMs);

        if (attempt === maxRetries - 1) {
          throw error;
        }

        // Wait for cooldown
        await new Promise(resolve => setTimeout(resolve, cooldownMs));
        continue;
      }

      throw error;
    }
  }

  throw new Error('Max retries exceeded');
}