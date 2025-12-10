import { createClient } from 'redis';

let redisClient: any;

export const initRedis = async () => {
  try {
    const redisUrl = process.env.REDIS_URL;
    
    let config: any;
    
    if (redisUrl) {
      // Parse the Redis URL manually to handle special characters
      try {
        const url = new URL(redisUrl);
        config = {
          socket: {
            host: url.hostname,
            port: parseInt(url.port || '6379'),
          },
          password: url.password,
          database: parseInt(url.pathname.slice(1) || '0'),
        };
      } catch (e) {
        console.warn('Failed to parse REDIS_URL, falling back to environment variables');
        config = {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
        };
      }
    } else {
      config = {
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        },
        password: process.env.REDIS_PASSWORD,
      };
    }

    redisClient = createClient(config);

    redisClient.on('error', (err: any) => console.log('Redis Client Error', err));
    redisClient.on('connect', () => console.log('✅ Redis connected'));

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
    throw error;
  }
};

export const getRedisClient = () => redisClient;

export const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    console.log('✅ Redis disconnected');
  }
};
