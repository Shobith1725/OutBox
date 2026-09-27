import IORedis from 'ioredis';
import { config } from '../config';

const redisOptions = {
  maxRetriesPerRequest: null, // Required by BullMQ
  ...(config.redisUrl.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}),
};

// Shared Redis connection for BullMQ and rate limiting
export const redisConnection = new IORedis(config.redisUrl, redisOptions);

// Separate connection for subscriber (BullMQ requires separate pub/sub connections)
export function createRedisConnection(): IORedis {
  return new IORedis(config.redisUrl, redisOptions);
}
