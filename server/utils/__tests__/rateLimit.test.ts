import { describe, expect, it } from 'vitest'
import { RateLimiter, rateLimitRuleFor } from '../rateLimit'

describe('rateLimitRuleFor', () => {
  it('limits only the token / public entry points', () => {
    expect(rateLimitRuleFor('/mcp')?.name).toBe('mcp')
    expect(rateLimitRuleFor('/MCP')?.name).toBe('mcp')
    expect(rateLimitRuleFor('/api/connect/check?project=x')?.name).toBe('connect')
    expect(rateLimitRuleFor('/api/public/abc')?.name).toBe('public')
    expect(rateLimitRuleFor('/api/public/abc/tasks/X-1')?.name).toBe('public')
    expect(rateLimitRuleFor('/auth/github')?.name).toBe('auth')
    expect(rateLimitRuleFor('/api/tasks')).toBeNull()
    expect(rateLimitRuleFor('/tasks')).toBeNull()
    expect(rateLimitRuleFor('/mcpx')).toBeNull()
  })
})

describe('RateLimiter', () => {
  const rule = { name: 't', capacity: 3, perMinute: 60 }

  it('allows a burst up to capacity, then refuses with Retry-After', () => {
    const limiter = new RateLimiter()
    for (let i = 0; i < 3; i++) expect(limiter.take(rule, 'ip', 0).allowed).toBe(true)
    const refused = limiter.take(rule, 'ip', 0)
    expect(refused.allowed).toBe(false)
    expect(refused.retryAfter).toBe(1)
  })

  it('refills over time and keeps clients and rules apart', () => {
    const limiter = new RateLimiter()
    for (let i = 0; i < 3; i++) limiter.take(rule, 'a', 0)
    expect(limiter.take(rule, 'a', 0).allowed).toBe(false)
    expect(limiter.take(rule, 'b', 0).allowed).toBe(true)
    expect(limiter.take({ ...rule, name: 'other' }, 'a', 0).allowed).toBe(true)
    expect(limiter.take(rule, 'a', 1000).allowed).toBe(true)
    expect(limiter.take(rule, 'a', 1000).allowed).toBe(false)
  })

  it('bounds memory', () => {
    const limiter = new RateLimiter()
    for (let i = 0; i < 10_050; i++) limiter.take(rule, `ip${i}`, 0)
    expect(limiter.size).toBeLessThanOrEqual(10_000)
  })
})
