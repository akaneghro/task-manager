import { describe, expect, it } from 'vitest'
import { getErrorCode, getErrorDetails, getErrorMessage, getErrorStatus, isConflictError, toSessionUser } from '../api'

// Shape of an ofetch FetchError for a ServiceError converted by toHttpError()
const fetchError = {
  message: '[PATCH] "/api/projects/x": 409 Conflict',
  statusCode: 409,
  statusMessage: 'Conflict',
  data: {
    statusCode: 409,
    message: 'Conflict',
    data: { code: 'conflict', message: 'The project was modified by someone else', details: { version: 4 } },
  },
}

describe('api error helpers', () => {
  it('reads the service payload of a FetchError', () => {
    expect(getErrorStatus(fetchError)).toBe(409)
    expect(getErrorCode(fetchError)).toBe('conflict')
    expect(getErrorMessage(fetchError)).toBe('The project was modified by someone else')
    expect(getErrorDetails(fetchError)).toEqual({ version: 4 })
    expect(isConflictError(fetchError)).toBe(true)
  })

  it('reads a NuxtError-like payload', () => {
    const err = { statusCode: 404, data: { code: 'not_found', message: 'Project not found' } }
    expect(getErrorCode(err)).toBe('not_found')
    expect(getErrorMessage(err)).toBe('Project not found')
    expect(isConflictError(err)).toBe(false)
  })

  it('falls back to body message, statusMessage and message', () => {
    expect(getErrorMessage({ data: { message: 'Validation Error' } })).toBe('Validation Error')
    expect(getErrorMessage({ statusMessage: 'Forbidden' })).toBe('Forbidden')
    expect(getErrorMessage(new Error('boom'))).toBe('boom')
    expect(getErrorMessage('plain')).toBe('plain')
  })

  it('returns null when nothing usable is present', () => {
    expect(getErrorMessage(undefined)).toBeNull()
    expect(getErrorMessage({})).toBeNull()
    expect(getErrorStatus(null)).toBeNull()
    expect(getErrorStatus({ response: { status: 500 } })).toBe(500)
  })
})

describe('toSessionUser', () => {
  it('narrows a session user', () => {
    expect(toSessionUser({ id: 'u1', login: 'ada', name: 'Ada', avatarUrl: null, role: 'owner' })).toEqual({
      id: 'u1', login: 'ada', name: 'Ada', avatarUrl: null, role: 'owner',
    })
  })

  it('rejects invalid values', () => {
    expect(toSessionUser(null)).toBeNull()
    expect(toSessionUser({ id: 'x' })).toBeNull()
  })
})
