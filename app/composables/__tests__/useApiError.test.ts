import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getErrorReason, useApiError } from '../useApiError'

const KNOWN = new Set(['errors.reasons.dependency_cycle', 'errors.reasons.already_member'])

beforeEach(() => {
  vi.stubGlobal('useI18n', () => ({ t: (key: string) => `t:${key}`, te: (key: string) => KNOWN.has(key) }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function fetchError(statusCode: number, data: Record<string, unknown>) {
  return Object.assign(new Error(`[POST] "/api/x": ${statusCode}`), { statusCode, data })
}

describe('useApiError', () => {
  it('translates known server reasons instead of showing the English message', () => {
    const err = fetchError(422, { code: 'invalid', message: 'ABC-1 cannot block ABC-2: it would create a dependency cycle', details: { reason: 'dependency_cycle' } })
    expect(getErrorReason(err)).toBe('dependency_cycle')
    expect(useApiError().message(err)).toBe('t:errors.reasons.dependency_cycle')
  })

  it('prefers translated status messages over server text', () => {
    const api = useApiError()
    expect(api.message(fetchError(404, { code: 'not_found', message: 'Project "x" not found' }))).toBe('t:errors.notFound')
    expect(api.message(fetchError(403, { code: 'forbidden', message: 'Not allowed: task.write' }))).toBe('t:errors.forbidden')
    expect(api.message(fetchError(422, { code: 'invalid', message: 'title: Required' }))).toBe('t:errors.validation')
    expect(api.message(fetchError(422, { code: 'invalid', message: 'x', details: { reason: 'unknown_reason' } }))).toBe('t:errors.validation')
    expect(api.message(fetchError(429, { code: 'rate_limited', message: 'Too many requests' }))).toBe('t:errors.rateLimited')
    expect(api.message(new Error('[GET] "/api/x": <no response> fetch failed'))).toBe('t:errors.generic')
  })

  it('tells a version conflict apart from a "name already taken" conflict', () => {
    const api = useApiError()
    const version = fetchError(409, { code: 'conflict', message: 'modified', details: { id: 'p', version: 2 } })
    const taken = fetchError(409, { code: 'conflict', message: '"bob" is already a member', details: { reason: 'already_member' } })
    expect(api.isConflict(version)).toBe(true)
    expect(api.message(version)).toBe('t:errors.conflict')
    expect(api.isConflict(taken)).toBe(false)
    expect(api.message(taken)).toBe('t:errors.reasons.already_member')
  })
})
