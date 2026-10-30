// MCP endpoint (Streamable HTTP, stateless). Modern-protocol clients get JSON bodies; legacy 2025-era clients
// (Claude Code today) get single SSE-framed responses. Bearer API tokens only: cookies are never read.

import type { McpHttpHandler } from '@modelcontextprotocol/server'
import { authenticateApiToken } from '../services/tokens'
import { mcpAuthInfo, parseDefaultProject, rawDefaultProject } from '../mcp/actor'
import { createTaskManagerMcpHandler } from '../mcp/server'

const ALLOWED_METHODS = ['POST', 'GET', 'DELETE']

const TOKEN_ERROR_DESCRIPTION = 'Task Manager API token missing, revoked or expired: create one in Settings > API tokens '
  + 'and rerun pnpm connect'

let handler: McpHttpHandler | null = null

function mcpHandler(): McpHttpHandler {
  if (!handler) {
    const config = useRuntimeConfig()
    handler = createTaskManagerMcpHandler(actor => ({
      db: useDb(),
      actor,
      vaultKey: config.vaultKey || undefined,
      siteUrl: config.public.siteUrl,
      timeZone: String(config.timezone ?? '').trim() || undefined,
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
    // Claude Code shows a 401 as "needs authentication": the description says what actually fixes it.
    return jsonError(401, 'unauthorized', 'Missing, invalid, expired or revoked API token', {
      'WWW-Authenticate': `Bearer realm="task-manager", error="invalid_token", error_description="${TOKEN_ERROR_DESCRIPTION}"`,
    })
  }

  // A default project that was sent but is not a valid slug is an error, not "no default project" (which would
  // silently put new tasks in the Inbox and list every project).
  const rawProject = rawDefaultProject(getRequestHeader(event, 'x-tm-project')) ?? rawDefaultProject(getQuery(event).project)
  const defaultProject = rawProject === null ? null : parseDefaultProject(rawProject)
  if (rawProject !== null && defaultProject === null) {
    return jsonError(400, 'invalid_project', `X-TM-Project "${rawProject.slice(0, 60)}" is not a valid project slug `
      + '(lowercase letters, numbers and dashes). Fix it in .mcp.json or rerun pnpm connect <repo> <slug>')
  }

  // toWebRequest streams the untouched body (nothing above reads it).
  return mcpHandler().fetch(toWebRequest(event), { authInfo: mcpAuthInfo(token, defaultProject) })
})
