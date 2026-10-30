// Cheap "has anything changed?" probe for UI polling (`GET /api/sync`).

import { eq, inArray, sql } from 'drizzle-orm'
import { comments, projects, tasks } from '../db/schema'
import type { SyncDto } from '../../shared/types/dto'
import { can } from '../../shared/utils/permissions'
import { ALL_PROJECTS } from '../../shared/utils/enums'
import type { ServiceContext } from './context'
import { getVisibleProjectBySlug, visibleProjectIds } from './lookup'

function toMillis(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Max `updated_at` across visible tasks (soft-deleted rows included, so deletions are noticed), projects and
 * comments. Checklist and link changes bump their task's `updated_at`.
 */
export async function getLastChange(ctx: ServiceContext, projectSlug?: string): Promise<SyncDto> {
  const slug = projectSlug?.trim()
  const projectIds = slug && slug.toLowerCase() !== ALL_PROJECTS
    ? [(await getVisibleProjectBySlug(ctx, slug)).id]
    : await visibleProjectIds(ctx)
  // Owner and MCP see every project, so deleted projects count too (their removal must be noticed).
  const seesAllProjects = !slug && (ctx.actor.kind === 'owner' || ctx.actor.kind === 'mcp')
  if (projectIds.length === 0 && !seesAllProjects) return { lastChange: null }

  const candidates: Array<number | null> = []

  const [projectRow] = await ctx.db.select({ max: sql<number | null>`max(${projects.updatedAt})` })
    .from(projects)
    .where(seesAllProjects ? undefined : inArray(projects.id, projectIds))
  candidates.push(toMillis(projectRow?.max))

  if (projectIds.length > 0) {
    const [taskRow] = await ctx.db.select({ max: sql<number | null>`max(${tasks.updatedAt})` })
      .from(tasks)
      .where(inArray(tasks.projectId, projectIds))
    candidates.push(toMillis(taskRow?.max))

    const commentProjectIds = projectIds.filter(id => can(ctx.actor, 'comment.read', { projectId: id }))
    if (commentProjectIds.length > 0) {
      const [commentRow] = await ctx.db.select({ max: sql<number | null>`max(${comments.updatedAt})` })
        .from(comments)
        .innerJoin(tasks, eq(tasks.id, comments.taskId))
        .where(inArray(tasks.projectId, commentProjectIds))
      candidates.push(toMillis(commentRow?.max))
    }
  }

  const values = candidates.filter((v): v is number => v !== null)
  return { lastChange: values.length > 0 ? new Date(Math.max(...values)).toISOString() : null }
}
