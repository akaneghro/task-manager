// CSRF protection for cookie-authenticated writes: /api/** requests that change state must come from this site.
// Requests with an Authorization header are exempt (browsers cannot attach one cross-site without a CORS
// preflight, which this server never approves). /mcp and /auth/** are not touched.

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export default defineEventHandler((event) => {
  const path = event.path.toLowerCase().replace(/\/{2,}/g, '/')
  if (!path.startsWith('/api/')) return
  if (SAFE_METHODS.has(event.method.toUpperCase())) return
  if (getHeader(event, 'authorization')) return

  const host = getRequestHost(event, { xForwardedHost: true })
  const siteUrl = useRuntimeConfig(event).public.siteUrl
  if (!isSameOriginRequest(getRequestHeaders(event), host, siteUrl)) {
    const message = 'Cross-site request blocked'
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message, data: { code: 'forbidden', message } })
  }
})
