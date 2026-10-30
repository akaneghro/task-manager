// MCP endpoint (Streamable HTTP, stateless, JSON responses). Bearer API tokens only: cookies are never read.

import type { McpHttpHandler } from '@modelcontextprotocol/server'
import { authenticateApiToken } from '../services/tokens'
import { mcpAuthInfo, parseDefaultProject } from '../mcp/actor'
import { createTaskManagerMcpHandler } from '../mcp/server'

const ALLOWED_METHODS = ['POST', 'GET', 'DELETE']

let handler: McpHttpHandler | null = null

function mcpHandler(): McpHttpHandler {
  if (!handler) {
    const config = useRuntimeConfig()
    handler = createTaskManagerMcpHandler(actor => ({
      db: useDb(),
      actor,
      vaultKey: config.vaultKey || undefined,
      siteUrl: config.public.siteUrl,
    }))
  }
  return handler
}

function jsonError(status: number, code: string, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })
}

export default defineEventHandler(async (event) => {
  if (!ALLOWED_METHODS.includes(event.method)) {
    return jsonError(405, 'method_not_allowed', 'Method not allowed', { Allow: ALLOWED_METHODS.join(', ') })
  }

  const match = /^Bearer\s+(\S+)$/i.exec(getRequestHeader(event, 'authorization')?.trim() ?? '')
  const token = match?.[1] ? await authenticateApiToken(useDb(), match[1]) : null
  if (!token) {
    return jsonError(401, 'unauthorized', 'Missing, invalid, expired or revoked API token', {
      'WWW-Authenticate': 'Bearer realm="task-manager"',
    })
  }

  const defaultProject = parseDefaultProject(getRequestHeader(event, 'x-tm-project'))
    ?? parseDefaultProject(getQuery(event).project)

  // toWebRequest streams the untouched body (nothing above reads it).
  return mcpHandler().fetch(toWebRequest(event), { authInfo: mcpAuthInfo(token, defaultProject) })
})
