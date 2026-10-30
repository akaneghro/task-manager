// Pure builder of the security headers set by server/middleware/security-headers.ts (unit tested).

export interface SecurityHeaderOptions {
  /** Whether the request reached us over HTTPS (directly or behind a proxy). */
  https: boolean
  /** Dev server: never send HSTS (it would pin localhost to HTTPS). */
  dev: boolean
}

const HSTS_MAX_AGE = 60 * 60 * 24 * 365

export function securityHeadersFor(path: string, opts: SecurityHeaderOptions): Record<string, string> {
  const lower = path.toLowerCase()
  const isShareLink = lower === '/s' || lower.startsWith('/s/') || lower.startsWith('/api/public/')
  const headers: Record<string, string> = {
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': 'frame-ancestors \'none\'; base-uri \'self\'; object-src \'none\'',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': isShareLink ? 'no-referrer' : 'strict-origin-when-cross-origin',
  }
  if (opts.https && !opts.dev) headers['Strict-Transport-Security'] = `max-age=${HSTS_MAX_AGE}`
  return headers
}
