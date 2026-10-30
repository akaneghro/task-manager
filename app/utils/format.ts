// Locale-aware date helpers used across the UI. Pure functions (the locale is passed in).

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Parses an ISO timestamp or a `YYYY-MM-DD` date (as a local calendar date, no timezone shift). */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const m = DATE_ONLY.exec(value)
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Today's local date as `YYYY-MM-DD`. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** `12 oct 2026` / `Oct 12, 2026`. Empty string for missing/invalid input. */
export function formatDate(value: string | null | undefined, locale: string): string {
  const date = parseDate(value)
  if (!date) return ''
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

/** Date + time (`12 oct 2026, 14:05`). Empty string for missing/invalid input. */
export function formatDateTime(value: string | null | undefined, locale: string): string {
  const date = parseDate(value)
  if (!date) return ''
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
]

/** `hace 5 minutos` / `in 2 days`. Empty string for missing/invalid input. */
export function formatRelative(value: string | null | undefined, locale: string, now: Date = new Date()): string {
  const date = parseDate(value)
  if (!date) return ''
  const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const abs = Math.abs(diffSeconds)
  if (abs < 45) return rtf.format(0, 'second')
  for (const [unit, seconds] of RELATIVE_UNITS) {
    if (abs >= seconds) return rtf.format(Math.round(diffSeconds / seconds), unit)
  }
  return rtf.format(diffSeconds, 'second')
}

/** Whether a `YYYY-MM-DD` due date is strictly before today. */
export function isOverdue(dateOnly: string | null | undefined, today: string = todayIso()): boolean {
  if (!dateOnly || !DATE_ONLY.test(dateOnly)) return false
  return dateOnly < today
}

/** Up to two uppercase initials for an avatar placeholder. */
export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean)
  const letters = parts.length > 1 ? `${parts[0]![0]}${parts[1]![0]}` : (parts[0] ?? '?').slice(0, 2)
  return letters.toUpperCase()
}
