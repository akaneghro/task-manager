// Shared bits for the MCP tool modules: annotations, parameter schemas and default-project resolution.

import type { McpServer, ToolAnnotations } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { taskRefSchema } from '../../../shared/schemas/common'
import { ServiceError } from '../../services/context'
import type { ServiceContext } from '../../services/context'

export type ToolRegistrar = (server: McpServer, ctx: ServiceContext) => void

export const READ_ONLY: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
export const WRITE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
export const IDEMPOTENT_WRITE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }

export const projectParam = z.string().trim().min(1).max(60)
  .describe('Project slug (see list_projects). Omit to use this session\'s default project.')

export const taskRefParam = taskRefSchema.describe('Task key like "ABC-12" (preferred) or task id.')

export const expectedVersionParam = z.number().int().positive()
  .describe('The task "version" from your last read (get_task / list_tasks / a previous write). Stale versions are rejected with the current state.')

/** The session default project (`X-TM-Project` header), if any. */
export function defaultProjectOf(ctx: ServiceContext): string | null {
  return ctx.actor.kind === 'mcp' ? ctx.actor.defaultProject : null
}

/** `project` argument or the session default; throws an actionable error when neither is available. */
export function requireProject(ctx: ServiceContext, project: string | undefined): string {
  const slug = project ?? defaultProjectOf(ctx)
  if (!slug) {
    throw new ServiceError(
      'invalid',
      'No project given and this session has no default project (X-TM-Project header). Pass "project" with a slug from list_projects',
    )
  }
  return slug
}

export function taskUrl(ctx: ServiceContext, key: string): string {
  return `${ctx.siteUrl.replace(/\/+$/, '')}/tasks/${encodeURIComponent(key)}`
}

export function projectUrl(ctx: ServiceContext, slug: string): string {
  return `${ctx.siteUrl.replace(/\/+$/, '')}/projects/${encodeURIComponent(slug)}`
}
