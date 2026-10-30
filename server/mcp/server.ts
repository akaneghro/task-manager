// Builds the Task Manager MCP server for one request (stateless): every tool closes over the ServiceContext.

import { McpServer, createMcpHandler } from '@modelcontextprotocol/server'
import type { McpHttpHandler } from '@modelcontextprotocol/server'
import type { Actor } from '../../shared/utils/permissions'
import type { ServiceContext } from '../services/context'
import { SERVER_INSTRUCTIONS } from './instructions'
import { registerPrompts } from './prompts'
import { mcpActorFromAuthInfo } from './actor'
import { registerProjectTools } from './tools/projects'
import { registerTaskTools } from './tools/tasks'
import { registerChecklistTools } from './tools/checklist'
import { registerSecretTools } from './tools/secrets'

export const MCP_SERVER_NAME = 'task-manager'
export const MCP_SERVER_VERSION = '0.1.0'

export const MCP_TOOL_NAMES = [
  'get_context',
  'list_projects',
  'get_project',
  'list_tasks',
  'get_task',
  'search_tasks',
  'create_task',
  'update_task',
  'set_status',
  'add_checklist_items',
  'toggle_checklist_item',
  'add_comment',
  'link_tasks',
  'unlink_tasks',
  'create_project',
  'update_project_notes',
  'update_project_links',
  'list_shared_secrets',
  'get_shared_secret',
] as const

export const MCP_PROMPT_NAMES = ['next-task', 'wrap-up'] as const

export function buildMcpServer(ctx: ServiceContext): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  )
  registerProjectTools(server, ctx)
  registerTaskTools(server, ctx)
  registerChecklistTools(server, ctx)
  registerSecretTools(server, ctx)
  registerPrompts(server)
  return server
}

/** Logs transport/factory/protocol errors (message only: never bodies, headers or tokens). */
export function logMcpError(error: unknown): void {
  console.error('[mcp]', error instanceof Error ? error.message : 'unknown error')
}

/**
 * Stateless Streamable HTTP handler. The caller authenticates the bearer token and passes `mcpAuthInfo(...)` as
 * `authInfo` to `handler.fetch()`; the factory turns it back into an actor and builds a per-request server.
 *
 * Response shape: modern (2026-07-28) clients get a single JSON body (the default `auto` mode; no tool emits
 * mid-call notifications, so it never upgrades to SSE). Legacy 2025-era clients, Claude Code included, go through
 * the SDK's stateless fallback, which always answers with a single SSE-framed response (the client must send
 * `Accept: application/json, text/event-stream`). `responseMode: 'json'` is not set on purpose: it only affects
 * modern traffic, which is already JSON, and makes the SDK log a warning at startup.
 */
export function createTaskManagerMcpHandler(contextFor: (actor: Actor) => ServiceContext): McpHttpHandler {
  return createMcpHandler(({ authInfo }) => {
    const actor = mcpActorFromAuthInfo(authInfo)
    if (!actor) throw new Error('MCP request without a valid identity')
    return buildMcpServer(contextFor(actor))
  }, { legacy: 'stateless', onerror: logMcpError })
}
