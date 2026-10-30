// Per-IP rate limiting of the unauthenticated / token entry points (see server/utils/rateLimit.ts).
// Invalid tokens are cheap (one indexed lookup) but unbounded floods would still cost DB reads.

import { RateLimiter, rateLimitRuleFor } from '../utils/rateLimit'

const limiter = new RateLimiter()

export default defineEventHandler((event) => {
  const rule = rateLimitRuleFor(event.path)
  if (!rule) return
  const client = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const result = limiter.take(rule, client)
  if (result.allowed) return
  setResponseHeader(event, 'Retry-After', result.retryAfter)
  const message = 'Too many requests, slow down'
  throw createError({ statusCode: 429, statusMessage: 'Too Many Requests', message, data: { code: 'rate_limited', message } })
})
