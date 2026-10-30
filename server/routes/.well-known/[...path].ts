// OAuth discovery probes (/.well-known/oauth-protected-resource, /.well-known/oauth-authorization-server...).
// MCP clients send them after a 401 from /mcp. This server uses static API tokens, not OAuth: answer with a small
// JSON 404 right away instead of rendering the SSR 404 page, and never advertise an authorization server.

export default defineEventHandler((event) => {
  setResponseStatus(event, 404)
  setResponseHeaders(event, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  return {
    error: 'not_found',
    message: 'Task Manager does not use OAuth. Authenticate /mcp with an API token (Settings > API tokens, then pnpm connect).',
  }
})
