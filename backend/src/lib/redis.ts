import IORedis from 'ioredis';
import { config } from '../config';

// Shared Redis connection for BullMQ and rate limiting
export const redisConnection = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null, // Required by BullMQ
});

// Separate connection for subscriber (BullMQ requires separate pub/sub connections)
export function createRedisConnection(): IORedis {
  return new IORedis(config.redisUrl, {
    maxRetriesPerRequest: null,
  });
}
