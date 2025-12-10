import { getRedisClient } from '../config/redis';

const RATE_LIMIT_WINDOW = 60; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // 100 requests per minute

export const rateLimitMiddleware = async (ip: string) => {
  const redis = getRedisClient();
  if (!redis) return true;

  const key = `rate-limit:${ip}`;
  const current = await redis.incr(key);

  if (current === 1) {
    await redis.expire(key, RATE_LIMIT_WINDOW);
  }

  return current <= RATE_LIMIT_MAX_REQUESTS;
};

export const getClientIP = (request: Request): string => {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || 'unknown';
};
