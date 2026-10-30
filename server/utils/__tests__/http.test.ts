import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ServiceError } from '../../services/context'
import { httpErrorInputOf, isSameOriginRequest, toHttpError } from '../http'

describe('httpErrorInputOf', () => {
  it.each([
    ['unauthorized', 401],
    ['forbidden', 403],
    ['not_found', 404],
    ['conflict', 409],
    ['invalid', 422],
  ] as const)('maps ServiceError %s to %i', (code, status) => {
    const input = httpErrorInputOf(new ServiceError(code, `boom ${code}`))
    expect(input).toEqual({
      statusCode: status,
      statusMessage: expect.any(String),
      message: `boom ${code}`,
      data: { code, message: `boom ${code}` },
    })
  })

  it('keeps details of non-conflict errors', () => {
    const issues = [{ path: 'name', message: 'Required' }]
    const input = httpErrorInputOf(new ServiceError('invalid', 'Bad input', issues))
    expect(input?.data).toEqual({ code: 'invalid', message: 'Bad input', details: issues })
  })

  it('exposes version conflicts as details and as a ConflictDto superset', () => {
    const current = { id: 't1', version: 3 }
    const input = httpErrorInputOf(new ServiceError('conflict', 'Modified', current))
    expect(input?.statusCode).toBe(409)
    expect(input?.data).toEqual({
      code: 'conflict',
      message: 'Modified',
      details: current,
      error: 'version_conflict',
      current,
    })
  })

  it('does not add ConflictDto fields to conflicts without a current state', () => {
    const input = httpErrorInputOf(new ServiceError('conflict', 'Name taken'))
    expect(input?.data).toEqual({ code: 'conflict', message: 'Name taken' })
  })

  it('maps ZodError to 422 with the issues', () => {
    const result = z.object({ name: z.string().min(1), nested: z.object({ n: z.number() }) })
      .safeParse({ name: '', nested: { n: 'x' } })
    expect(result.success).toBe(false)
    const input = httpErrorInputOf(result.error)
    expect(input?.statusCode).toBe(422)
    expect(input?.data.code).toBe('invalid')
    expect(input?.message).toMatch(/^Invalid input: name: /)
    expect(input?.data.details).toEqual([
      expect.objectContaining({ path: 'name', code: 'too_small' }),
      expect.objectContaining({ path: 'nested.n', code: 'invalid_type' }),
    ])
  })

  it('returns null for other errors', () => {
    expect(httpErrorInputOf(new Error('x'))).toBeNull()
    expect(httpErrorInputOf('x')).toBeNull()
    expect(httpErrorInputOf(null)).toBeNull()
  })
})

describe('toHttpError', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('builds an H3 error for service errors', () => {
    const createError = vi.fn((input: { message: string }) => Object.assign(new Error(input.message), { input }))
    vi.stubGlobal('createError', createError)
    const error = toHttpError(new ServiceError('not_found', 'Task "X-1" not found'))
    expect(createError).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404, data: { code: 'not_found', message: 'Task "X-1" not found' } }))
    expect(error.message).toBe('Task "X-1" not found')
  })

  it('returns other errors unchanged', () => {
    const createError = vi.fn()
    vi.stubGlobal('createError', createError)
    const original = new TypeError('kaput')
    expect(toHttpError(original)).toBe(original)
    expect(toHttpError('text').message).toBe('text')
    expect(createError).not.toHaveBeenCalled()
  })
})

describe('isSameOriginRequest', () => {
  const site = 'https://tasks.example.com'

  it('accepts an Origin equal to the request host', () => {
    expect(isSameOriginRequest({ origin: 'http://localhost:3000' }, 'localhost:3000', site)).toBe(true)
  })

  it('accepts an Origin equal to the configured site URL host', () => {
    expect(isSameOriginRequest({ origin: 'https://tasks.example.com' }, 'internal:8080', site)).toBe(true)
  })

  it('compares hosts case-insensitively and ignores default ports', () => {
    expect(isSameOriginRequest({ origin: 'https://App.Example.com' }, 'app.example.com:443', '')).toBe(true)
  })

  it('falls back to the Referer when there is no Origin', () => {
    expect(isSameOriginRequest({ referer: 'http://localhost:3000/tasks?view=board' }, 'localhost:3000', site)).toBe(true)
    expect(isSameOriginRequest({ referer: 'https://evil.test/page' }, 'localhost:3000', site)).toBe(false)
  })

  it('prefers the Origin over the Referer', () => {
    expect(isSameOriginRequest({ origin: 'https://evil.test', referer: 'http://localhost:3000/' }, 'localhost:3000', site)).toBe(false)
  })

  it('rejects other origins, other ports and look-alike hosts', () => {
    expect(isSameOriginRequest({ origin: 'https://evil.test' }, 'localhost:3000', site)).toBe(false)
    expect(isSameOriginRequest({ origin: 'http://localhost:4000' }, 'localhost:3000', site)).toBe(false)
    expect(isSameOriginRequest({ origin: 'https://tasks.example.com.evil.test' }, 'localhost:3000', site)).toBe(false)
  })

  it('rejects missing, opaque and non-http origins', () => {
    expect(isSameOriginRequest({}, 'localhost:3000', site)).toBe(false)
    expect(isSameOriginRequest({ origin: 'null' }, 'localhost:3000', site)).toBe(false)
    expect(isSameOriginRequest({ origin: 'not a url' }, 'localhost:3000', site)).toBe(false)
    expect(isSameOriginRequest({ origin: 'file:///C:/x.html' }, 'localhost:3000', site)).toBe(false)
  })

  it('handles array headers and an empty request host', () => {
    expect(isSameOriginRequest({ origin: ['https://tasks.example.com'] }, '', site)).toBe(true)
    expect(isSameOriginRequest({ origin: 'http://localhost:3000' }, '', '')).toBe(false)
  })
})
