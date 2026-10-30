import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, formatRelative, initials, isOverdue, parseDate, todayIso } from '../format'

describe('parseDate', () => {
  it('parses date-only strings as local calendar dates', () => {
    const d = parseDate('2026-03-05')
    expect(d?.getFullYear()).toBe(2026)
    expect(d?.getMonth()).toBe(2)
    expect(d?.getDate()).toBe(5)
  })

  it('returns null for missing or invalid input', () => {
    expect(parseDate(null)).toBeNull()
    expect(parseDate('')).toBeNull()
    expect(parseDate('not a date')).toBeNull()
  })
})

describe('todayIso', () => {
  it('formats the local date as YYYY-MM-DD', () => {
    expect(todayIso(new Date(2026, 0, 9, 23, 59))).toBe('2026-01-09')
  })
})

describe('formatDate', () => {
  it('formats in the given locale without timezone shift', () => {
    expect(formatDate('2026-10-12', 'en-US')).toBe('Oct 12, 2026')
    expect(formatDate('2026-10-12', 'es')).toContain('12')
    expect(formatDate('2026-10-12', 'es')).toContain('2026')
  })

  it('returns an empty string for null', () => {
    expect(formatDate(null, 'es')).toBe('')
    expect(formatDateTime(undefined, 'es')).toBe('')
  })

  it('formats timestamps with time', () => {
    expect(formatDateTime('2026-10-12T10:05:00', 'en-US')).toMatch(/10:05/)
  })
})

describe('formatRelative', () => {
  const now = new Date('2026-10-30T12:00:00Z')

  it('uses "now" for very recent dates', () => {
    expect(formatRelative('2026-10-30T11:59:50Z', 'en', now)).toBe('now')
  })

  it('picks a sensible unit', () => {
    expect(formatRelative('2026-10-30T11:55:00Z', 'en', now)).toBe('5 minutes ago')
    expect(formatRelative('2026-10-30T09:00:00Z', 'en', now)).toBe('3 hours ago')
    expect(formatRelative('2026-11-01T12:00:00Z', 'en', now)).toBe('in 2 days')
    expect(formatRelative('2026-10-29T12:00:00Z', 'en', now)).toBe('yesterday')
  })

  it('localizes', () => {
    expect(formatRelative('2026-10-30T11:55:00Z', 'es', now)).toBe('hace 5 minutos')
  })

  it('returns an empty string for invalid input', () => {
    expect(formatRelative('nope', 'en', now)).toBe('')
  })
})

describe('isOverdue', () => {
  it('is true only for dates strictly before today', () => {
    expect(isOverdue('2026-10-29', '2026-10-30')).toBe(true)
    expect(isOverdue('2026-10-30', '2026-10-30')).toBe(false)
    expect(isOverdue('2026-10-31', '2026-10-30')).toBe(false)
  })

  it('is false for missing or malformed dates', () => {
    expect(isOverdue(null, '2026-10-30')).toBe(false)
    expect(isOverdue('soon', '2026-10-30')).toBe(false)
  })
})

describe('initials', () => {
  it('builds up to two letters', () => {
    expect(initials('Ada Lovelace')).toBe('AL')
    expect(initials('akaneghro')).toBe('AK')
    expect(initials(null)).toBe('?')
  })
})
