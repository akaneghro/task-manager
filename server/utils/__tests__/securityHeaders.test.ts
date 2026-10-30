import { describe, expect, it } from 'vitest'
import { securityHeadersFor } from '../securityHeaders'

describe('securityHeadersFor', () => {
  it('forbids framing and sniffing everywhere', () => {
    for (const path of ['/', '/tasks', '/api/tokens', '/mcp', '/auth/github']) {
      const headers = securityHeadersFor(path, { https: false, dev: false })
      expect(headers['X-Frame-Options']).toBe('DENY')
      expect(headers['Content-Security-Policy']).toContain('frame-ancestors \'none\'')
      expect(headers['X-Content-Type-Options']).toBe('nosniff')
      expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    }
  })

  it('sends no Referer from share-link pages and their API', () => {
    expect(securityHeadersFor('/s/abc', { https: true, dev: false })['Referrer-Policy']).toBe('no-referrer')
    expect(securityHeadersFor('/api/public/abc/tasks/X-1', { https: true, dev: false })['Referrer-Policy']).toBe('no-referrer')
    expect(securityHeadersFor('/settings', { https: true, dev: false })['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
  })

  it('adds HSTS only on HTTPS outside dev', () => {
    expect(securityHeadersFor('/', { https: true, dev: false })['Strict-Transport-Security']).toMatch(/^max-age=\d+$/)
    expect(securityHeadersFor('/', { https: false, dev: false })['Strict-Transport-Security']).toBeUndefined()
    expect(securityHeadersFor('/', { https: true, dev: true })['Strict-Transport-Security']).toBeUndefined()
  })
})
