// Shared bits for the MCP tool modules: annotations, parameter schemas and default-project resolution.

import type { McpServer, ToolAnnotations } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { taskRefSchema } from '../../../shared/schemas/common'
import { ALL_PROJECTS } from '../../../shared/utils/enums'
import { canSeeProject } from '../../../shared/utils/permissions'
import type { ProjectRow } from '../../db/schema'
import { ServiceError, isServiceError } from '../../services/context'
import type { ServiceContext } from '../../services/context'
import { findProjectRowByKey, getVisibleProjectBySlug } from '../../services/lookup'

export type ToolRegistrar = (server: McpServer, ctx: ServiceContext) => void

export const READ_ONLY: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
export const WRITE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
export const IDEMPOTENT_WRITE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
/** Removes data (only `unlink_tasks`): clients should ask before running it. */
export const DESTRUCTIVE_IDEMPOTENT_WRITE: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }

export const projectParam = z.string().trim().min(1).max(60)
  .describe('Project slug (see list_projects; the project key such as "RNK" also works). Omit to use this session\'s default project.')

export const taskRefParam = taskRefSchema.describe('Task key like "ABC-12" (preferred) or task id.')

export const expectedVersionParam = z.number().int().positive()
  .describe('The task "version" from your last read (get_task / list_tasks / a previous write). Stale versions are rejected with the current state.')

/** The session default project (`X-TM-Project` header), if any. */
export function defaultProjectOf(ctx: ServiceContext): string | null {
  return ctx.actor.kind === 'mcp' ? ctx.actor.defaultProject : null
}

const PROJECT_KEY_RE = /^[a-z][a-z0-9]{1,5}$/i

/**
 * Resolves a project argument to a visible project: by slug, else by project key (Claude often only knows the
 * key from task keys like RNK-12). Throws an actionable `not_found` otherwise.
 */
export async function resolveProjectArg(ctx: ServiceContext, value: string, fromSession = false): Promise<ProjectRow> {
  try {
    return await getVisibleProjectBySlug(ctx, value)
  }
  catch (error) {
    if (!isServiceError(error) || error.code !== 'not_found') throw error
  }
  if (PROJECT_KEY_RE.test(value.trim())) {
    const byKey = await findProjectRowByKey(ctx.db, value)
    if (byKey && canSeeProject(ctx.actor, byKey.id)) return byKey
  }
  const origin = fromSession ? ' (the session default project, from the X-TM-Project header of .mcp.json)' : ''
  throw new ServiceError(
    'not_found',
    `Project "${value}" not found${origin}. Use list_projects to see the valid slugs and keys`
    + (fromSession ? ', and ask the user to fix the header (pnpm connect <repo> <slug>)' : ''),
    { reason: 'project_not_found' },
  )
}

/** `project` argument or the session default, resolved to a slug; throws an actionable error when neither is given. */
export async function requireProject(ctx: ServiceContext, project: string | undefined): Promise<string> {
  if (project) return (await resolveProjectArg(ctx, project)).slug
  const fallback = defaultProjectOf(ctx)
  if (!fallback) {
    throw new ServiceError(
      'invalid',
      'No project given and this session has no default project (X-TM-Project header). Pass "project" with a slug from list_projects',
    )
  }
  return (await resolveProjectArg(ctx, fallback, true)).slug
}

/**
 * Project scope of the listing tools: `project` argument, else the session default, else every project.
 * Returns a resolved slug or `all`.
 */
export async function listingScope(ctx: ServiceContext, project: string | undefined): Promise<string> {
  if (project) {
    return project.trim().toLowerCase() === ALL_PROJECTS ? ALL_PROJECTS : (await resolveProjectArg(ctx, project)).slug
  }
  const fallback = defaultProjectOf(ctx)
  return fallback ? (await resolveProjectArg(ctx, fallback, true)).slug : ALL_PROJECTS
}

export function taskUrl(ctx: ServiceContext, key: string): string {
  return `${ctx.siteUrl.replace(/\/+$/, '')}/tasks/${encodeURIComponent(key)}`
}

export function projectUrl(ctx: ServiceContext, slug: string): string {
  return `${ctx.siteUrl.replace(/\/+$/, '')}/projects/${encodeURIComponent(slug)}`
}
