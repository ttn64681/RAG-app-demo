import { redis } from './redis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

/**
 * Rate limiting using Upstash Redis
 * Prevents spam and API abuse
 * 
 * Gemini API Free Tier Limits:
 * - 15 requests per minute (RPM)
 * - 1,500 requests per day
 */
export async function checkRateLimit(
  identifier: string,
  limit: number = 10,
  windowSeconds: number = 60
): Promise<RateLimitResult> {
  const key = `ratelimit:${identifier}`;
  
  try {
    // Upstash syntax: returns value directly, or null
    const current = await redis.get<number>(key);
    const count = current ? Number(current) : 0;
    
    if (count >= limit) {
      const ttl = await redis.ttl(key);
      return {
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + (ttl * 1000),
        retryAfter: ttl,
      };
    }
    
    // Upstash syntax: set(key, value, { ex: seconds })
    if (count === 0) {
      await redis.set(key, 1, { ex: windowSeconds });
    } else {
      await redis.incr(key);
    }
    
    const ttl = await redis.ttl(key);
    const newCount = count + 1;
    
    return {
      allowed: true,
      remaining: Math.max(0, limit - newCount),
      resetAt: Date.now() + (ttl * 1000),
    };
  } catch (error) {
    console.error('Rate limit check error:', error);
    // Fail open on error
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt: Date.now() + (windowSeconds * 1000),
    };
  }
}

/**
 * Get client identifier from request
 * Uses IP address for anonymous users
 */
export function getClientIdentifier(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0] || realIp || 'unknown';
  return `ip:${ip}`;
}
