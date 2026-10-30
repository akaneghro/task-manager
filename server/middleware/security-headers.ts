// Defense-in-depth response headers for every route (pages, /api, /mcp, /auth):
// - no framing (clickjacking), no MIME sniffing, a conservative Referrer-Policy (none at all on /s/** so share
//   tokens never leak through Referer), and HSTS on HTTPS outside dev.
// A full script-src CSP is not set: Nuxt's inline payload and color-mode scripts would need nonces/hashes.
// The session cookie stays SameSite=Lax (nuxt.config.ts), which already keeps it out of cross-site frames.

import { securityHeadersFor } from '../utils/securityHeaders'

export default defineEventHandler((event) => {
  const https = getRequestProtocol(event, { xForwardedProto: true }) === 'https'
  setResponseHeaders(event, securityHeadersFor(event.path, { https, dev: import.meta.dev }))
})
