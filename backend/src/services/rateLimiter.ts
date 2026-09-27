import { redisConnection } from '../lib/redis';

/**
 * Redis-backed rate limiter using atomic INCR + EXPIRE.
 * Key: rate:${senderId}:${hourWindow}
 * 
 * Uses a Lua script for atomicity to avoid race conditions across
 * concurrent workers. The script INCRs the counter and sets an
 * expiry only on the first increment (when count == 1).
 * 
 * Returns { allowed: boolean, current: number }
 */
const RATE_LIMIT_LUA = `
  local key = KEYS[1]
  local limit = tonumber(ARGV[1])
  local current = redis.call('INCR', key)
  if current == 1 then
    redis.call('EXPIRE', key, 3600)
  end
  if current > limit then
    redis.call('DECR', key)
    return {0, current - 1}
  end
  return {1, current}
`;

/**
 * Get the current hour window key for deterministic bucketing.
 * Window = floor(timestamp / 3600000) — same across all workers.
 */
function getHourWindow(timestamp?: number): string {
  const ts = timestamp || Date.now();
  return Math.floor(ts / 3600000).toString();
}

/**
 * Check and increment the rate limit counter for a sender.
 * Returns whether the email is allowed and the current count.
 */
export async function checkRateLimit(
  senderId: string,
  limit: number
): Promise<{ allowed: boolean; current: number }> {
  const hourWindow = getHourWindow();
  const key = `rate:${senderId}:${hourWindow}`;

  const result = await redisConnection.eval(
    RATE_LIMIT_LUA,
    1,
    key,
    limit.toString()
  ) as [number, number];

  return {
    allowed: result[0] === 1,
    current: result[1],
  };
}

/**
 * Check if a Slack notification has already been sent for this sender
 * in the current hour window. Uses a Redis flag to debounce.
 */
export async function shouldNotifySlack(senderId: string): Promise<boolean> {
  const hourWindow = getHourWindow();
  const key = `notified:${senderId}:${hourWindow}`;

  // SET NX returns 'OK' only if the key didn't exist → first notification
  const result = await redisConnection.set(key, '1', 'EX', 3600, 'NX');
  return result === 'OK';
}

/**
 * Compute the delay (in ms) until the start of the next hour window.
 */
export function getDelayToNextHourWindow(): number {
  const now = Date.now();
  const currentHourStart = Math.floor(now / 3600000) * 3600000;
  const nextHourStart = currentHourStart + 3600000;
  return nextHourStart - now + 1000; // +1s buffer
}

/**
 * Get the current rate count for a sender (for monitoring).
 */
export async function getCurrentRate(senderId: string): Promise<number> {
  const hourWindow = getHourWindow();
  const key = `rate:${senderId}:${hourWindow}`;
  const count = await redisConnection.get(key);
  return count ? parseInt(count, 10) : 0;
}
