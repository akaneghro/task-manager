import { describe, expect, it } from 'vitest'
import type { Db } from '../../db'
import type { ServiceContext } from '../context'
import { todayOf } from '../taskMappers'

function ctxAt(iso: string, timeZone?: string): ServiceContext {
  return {
    db: {} as unknown as Db,
    actor: { kind: 'owner', userId: 'u', source: 'user:u' },
    siteUrl: 'http://localhost:3000',
    now: () => new Date(iso),
    timeZone,
  }
}

describe('todayOf', () => {
  it('uses the owner time zone (Europe/Madrid by default), not UTC', () => {
    // 00:30 CEST on 2026-07-31 is still 2026-07-30 in UTC; 00:30 CET on 2026-12-01 is 23:30 UTC the day before.
    expect(todayOf(ctxAt('2026-07-30T22:30:00Z'))).toBe('2026-07-31')
    expect(todayOf(ctxAt('2026-11-30T23:30:00Z'))).toBe('2026-12-01')
    expect(todayOf(ctxAt('2026-11-30T22:30:00Z'))).toBe('2026-11-30')
  })

  it('honours a configured zone and falls back to UTC for an invalid one', () => {
    expect(todayOf(ctxAt('2026-10-30T22:30:00Z', 'UTC'))).toBe('2026-10-30')
    expect(todayOf(ctxAt('2026-10-31T02:00:00Z', 'America/New_York'))).toBe('2026-10-30')
    expect(todayOf(ctxAt('2026-10-30T22:30:00Z', 'Not/AZone'))).toBe('2026-10-30')
  })
})
