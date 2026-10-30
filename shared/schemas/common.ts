import { z } from 'zod'
import { parseTaskKey, isUuid } from '../utils/taskKey'

/** `YYYY-MM-DD` calendar date. */
export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD').refine((value) => {
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value)
}, 'Invalid date')

export const slugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes').max(60)

export const projectKeySchema = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,5}$/, '2-6 characters, A-Z and digits, starting with a letter')

/** Task reference: a task key (`RNK-12`, case-insensitive) or a task UUID. */
export const taskRefSchema = z.string().trim().min(1).refine(
  value => parseTaskKey(value) !== null || isUuid(value),
  'Expected a task key like ABC-12 or a task id',
)

export const urlSchema = z.string().trim().url().max(2000).refine(
  value => /^https?:\/\//i.test(value),
  'Only http(s) URLs are allowed',
)

export const versionSchema = z.number().int().positive()

export const idSchema = z.string().uuid()

/** Booleans that arrive as query strings. */
export const queryBoolean = z.union([z.boolean(), z.enum(['true', 'false', '1', '0'])]).transform(v => v === true || v === 'true' || v === '1')

/** Comma separated list (`a,b`) or repeated query param (`?s=a&s=b`) parsed into an array of enum values. */
export function queryEnumList<const T extends readonly [string, ...string[]]>(values: T) {
  return z.union([z.array(z.enum(values)), z.string()])
    .transform(v => (Array.isArray(v) ? v : v.split(',').map(s => s.trim()).filter(Boolean)))
    .pipe(z.array(z.enum(values)))
}
