// Small in-memory, per-client token-bucket limiter for the unauthenticated / token entry points
// (/mcp, /api/connect/check, /api/public/**, /auth/**). Pure and unit tested; the middleware applies it.
// In-memory buckets are per server instance: on serverless hosts prefer the platform's edge rate limiting too.

export interface RateLimitRule {
  /** Bucket name (one bucket per rule and client). */
  name: string
  /** Max burst (bucket size). */
  capacity: number
  /** Sustained requests per minute (refill rate). */
  perMinute: number
}

const RULES: ReadonlyArray<{ match: (path: string) => boolean, rule: RateLimitRule }> = [
  { match: p => p === '/mcp' || p.startsWith('/mcp/') || p.startsWith('/mcp?'), rule: { name: 'mcp', capacity: 120, perMinute: 600 } },
  { match: p => p.startsWith('/api/connect/'), rule: { name: 'connect', capacity: 20, perMinute: 30 } },
  { match: p => p.startsWith('/api/public/'), rule: { name: 'public', capacity: 60, perMinute: 240 } },
  { match: p => p.startsWith('/auth/'), rule: { name: 'auth', capacity: 20, perMinute: 30 } },
]

/** The rule that applies to a request path, or null when the path is not rate limited. */
export function rateLimitRuleFor(path: string): RateLimitRule | null {
  const lower = path.toLowerCase().replace(/\/{2,}/g, '/')
  return RULES.find(r => r.match(lower))?.rule ?? null
}

interface Bucket {
  tokens: number
  updatedAt: number
}

export interface RateLimitResult {
  allowed: boolean
  /** Seconds until one request is allowed again (only when not allowed). */
  retryAfter: number
}

const MAX_BUCKETS = 10_000

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>()

  /** Consumes one token for `client` under `rule` at time `now` (ms). */
  take(rule: RateLimitRule, client: string, now: number = Date.now()): RateLimitResult {
    const key = `${rule.name}:${client}`
    const perMs = rule.perMinute / 60_000
    const bucket = this.buckets.get(key) ?? { tokens: rule.capacity, updatedAt: now }
    bucket.tokens = Math.min(rule.capacity, bucket.tokens + Math.max(0, now - bucket.updatedAt) * perMs)
    bucket.updatedAt = now
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1
      this.store(key, bucket, now)
      return { allowed: true, retryAfter: 0 }
    }
    this.store(key, bucket, now)
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((1 - bucket.tokens) / perMs / 1000)) }
  }

  get size(): number {
    return this.buckets.size
  }

  private store(key: string, bucket: Bucket, now: number) {
    this.buckets.delete(key)
    this.buckets.set(key, bucket)
    if (this.buckets.size <= MAX_BUCKETS) return
    // Drop full (idle) buckets first, then the least recently used ones.
    for (const [k, b] of this.buckets) {
      if (now - b.updatedAt > 10 * 60_000) this.buckets.delete(k)
    }
    while (this.buckets.size > MAX_BUCKETS) {
      const oldest = this.buckets.keys().next().value
      if (oldest === undefined) break
      this.buckets.delete(oldest)
    }
  }
}
