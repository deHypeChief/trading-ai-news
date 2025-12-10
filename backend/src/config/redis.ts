import { createClient } from 'redis';

let redisClient: any;

export const initRedis = async () => {
  try {
    const redisUrl = process.env.REDIS_URL;
    
    const config = redisUrl 
      ? { url: redisUrl }
      : {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
        };

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
