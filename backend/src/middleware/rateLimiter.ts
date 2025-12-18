import { getRedisClient } from '../config/redis';
import type { Elysia } from 'elysia';

const WINDOW_SECONDS = parseInt(process.env.RATE_LIMIT_WINDOW || '60', 10); // window in seconds
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX || '100', 10); // max requests per window
const MAX_REQUESTS_PER_SEC = parseInt(process.env.RATE_LIMIT_SEC_MAX || '5', 10); // per-second limit
const MAX_BODY_BYTES = parseInt(process.env.RATE_LIMIT_MAX_BODY_BYTES || (1_000_000).toString(), 10); // 1MB default

// In-memory fallback store when Redis is not available (not persistent across instances)
const inMemoryStore = new Map<string, { count: number; expiresAt: number }>();

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

async function redisIncrWithExpiry(key: string, expirySec: number) {
  const redis = getRedisClient();
  if (!redis) return null;

  // Use Redis INCR and EXPIRE if first seen
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, expirySec);
  }

  const ttl = await redis.ttl(key);
  return { current, ttl };
}

async function checkRateLimitForKey(key: string) {
  // 1) per-window check
  const windowKey = `rlw:${key}:${WINDOW_SECONDS}`;
  const perSecKey = `rls:${key}:${1}`;

  const redis = getRedisClient();

  if (redis) {
    const w = await redisIncrWithExpiry(windowKey, WINDOW_SECONDS);
    const s = await redisIncrWithExpiry(perSecKey, 1);

    const remaining = Math.max(0, MAX_REQUESTS - (w?.current || 0));
    const retryAfter = (w && w.current > MAX_REQUESTS) ? (w.ttl || WINDOW_SECONDS) : 0;
    const blocked = (w && w.current > MAX_REQUESTS) || (s && s.current > MAX_REQUESTS_PER_SEC);

    return {
      allowed: !blocked,
      limit: MAX_REQUESTS,
      remaining: Math.max(0, remaining),
      reset: nowSeconds() + (w?.ttl || WINDOW_SECONDS),
      retryAfter,
    };
  }

  // In-memory fallback
  const entry = inMemoryStore.get(key);
  const now = nowSeconds();
  if (!entry || entry.expiresAt <= now) {
    inMemoryStore.set(key, { count: 1, expiresAt: now + WINDOW_SECONDS });
    return { allowed: true, limit: MAX_REQUESTS, remaining: MAX_REQUESTS - 1, reset: now + WINDOW_SECONDS, retryAfter: 0 };
  }

  entry.count += 1;
  inMemoryStore.set(key, entry);

  const blocked = entry.count > MAX_REQUESTS;
  return { allowed: !blocked, limit: MAX_REQUESTS, remaining: Math.max(0, MAX_REQUESTS - entry.count), reset: entry.expiresAt, retryAfter: blocked ? (entry.expiresAt - now) : 0 };
}

function getIpFromRequest(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || request.headers.get('cf-connecting-ip') || request.headers.get('x-client-ip') || request.headers.get('x-forwarded') || 'unknown';
}

export const rateLimiter = () => (app: Elysia) => {
  app.onRequest(async ({ request, set }) => {
    // Body size protection
    const cl = request.headers.get('content-length');
    if (cl && Number(cl) > MAX_BODY_BYTES) {
      set.status = 413;
      return { error: 'Payload Too Large' };
    }

    // Identify by IP + method + route to reduce abuse
    const ip = getIpFromRequest(request);
    const route = request.url?.split('?')[0] || request.url || 'unknown';
    const key = `${ip}:${request.method}:${route}`;

    try {
      const status = await checkRateLimitForKey(key);

      // Set informative headers
      // Note: Elysia provides `set` for status; for headers we return a Response like object
      const headers = {
        'X-RateLimit-Limit': String(status.limit),
        'X-RateLimit-Remaining': String(status.remaining),
        'X-RateLimit-Reset': String(status.reset),
      } as Record<string, string>;

      if (!status.allowed) {
        set.status = 429;
        // Set Retry-After header when possible
        (set as any).headers = { ...((set as any).headers || {}), ...headers, 'Retry-After': String(status.retryAfter || 1) };
        return { error: 'Too Many Requests' };
      }

      // Attach rate info to context for downstream use if needed
      (request as any).rateLimit = status;
      (set as any).headers = { ...((set as any).headers || {}), ...headers };

      return;
    } catch (error) {
      // If something goes wrong, fail open (do not break traffic), but log
      console.error('Rate limiter error:', error);
      return;
    }
  });

  return app;
};
