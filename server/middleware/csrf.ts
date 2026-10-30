// CSRF protection for cookie-authenticated writes: /api/** requests that change state must come from this site.
// There is no exemption for requests carrying an Authorization header: every /api write handler authenticates
// from the session cookie (defineSessionHandler), so a bearer header would protect nothing and would turn any
// future CORS rule into a CSRF bypass. If a bearer-only /api write route is ever added, allowlist its exact path
// in needsCsrfCheck, and only if it never reads the session. /mcp and /auth/** are not touched.

export default defineEventHandler((event) => {
  if (!needsCsrfCheck(event.method, event.path)) return

  const host = getRequestHost(event, { xForwardedHost: true })
  const siteUrl = useRuntimeConfig(event).public.siteUrl
  if (!isSameOriginRequest(getRequestHeaders(event), host, siteUrl)) {
    const message = 'Cross-site request blocked'
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message, data: { code: 'forbidden', message } })
  }
})
