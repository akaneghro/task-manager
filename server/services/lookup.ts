// Project lookups shared by every service. Visibility is always checked here.

import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { projects, tasks } from '../db/schema'
import type { ProjectRow } from '../db/schema'
import type { Db } from '../db'
import { TASK_STATUSES } from '../../shared/utils/enums'
import type { TaskStatus } from '../../shared/utils/enums'
import type { TaskCountsByStatus } from '../../shared/types/dto'
import { canSeeProject } from '../../shared/utils/permissions'
import { ServiceError } from './context'
import type { ServiceContext } from './context'

export async function findProjectRowBySlug(db: Db, slug: string): Promise<ProjectRow | null> {
  const [row] = await db.select().from(projects)
    .where(and(eq(projects.slug, slug.trim().toLowerCase()), isNull(projects.deletedAt)))
    .limit(1)
  return row ?? null
}

export async function findProjectRowById(db: Db, id: string): Promise<ProjectRow | null> {
  const [row] = await db.select().from(projects)
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    .limit(1)
  return row ?? null
}

export async function findProjectRowByKey(db: Db, key: string): Promise<ProjectRow | null> {
  const [row] = await db.select().from(projects)
    .where(and(eq(projects.key, key.trim().toUpperCase()), isNull(projects.deletedAt)))
    .limit(1)
  return row ?? null
}

/**
 * Loads a non-deleted project the actor can see. Throws `not_found` both when it does not exist and when the
 * actor cannot see it (no information leak about other projects).
 */
export async function getVisibleProjectBySlug(ctx: ServiceContext, slug: string): Promise<ProjectRow> {
  const row = await findProjectRowBySlug(ctx.db, slug)
  if (!row || !canSeeProject(ctx.actor, row.id)) throw new ServiceError('not_found', `Project "${slug}" not found`)
  return row
}

export async function getVisibleProjectById(ctx: ServiceContext, id: string): Promise<ProjectRow> {
  const row = await findProjectRowById(ctx.db, id)
  if (!row || !canSeeProject(ctx.actor, row.id)) throw new ServiceError('not_found', 'Project not found')
  return row
}

/** Ids of every non-deleted project the actor can see. */
export async function visibleProjectIds(ctx: ServiceContext): Promise<string[]> {
  const actor = ctx.actor
  if (actor.kind === 'public') return [actor.projectId]
  const rows = await ctx.db.select({ id: projects.id }).from(projects).where(isNull(projects.deletedAt))
  return rows.map(r => r.id).filter(id => canSeeProject(actor, id))
}

export function emptyCounts(): TaskCountsByStatus {
  return Object.fromEntries(TASK_STATUSES.map(s => [s, 0])) as TaskCountsByStatus
}

/** Task counts by status for the given projects (non-deleted tasks only). */
export async function countTasksByStatus(db: Db, projectIds: readonly string[]): Promise<Map<string, TaskCountsByStatus>> {
  const result = new Map<string, TaskCountsByStatus>()
  for (const id of projectIds) result.set(id, emptyCounts())
  if (projectIds.length === 0) return result
  const rows = await db
    .select({ projectId: tasks.projectId, status: tasks.status, n: sql<number>`count(*)` })
    .from(tasks)
    .where(and(inArray(tasks.projectId, [...projectIds]), isNull(tasks.deletedAt)))
    .groupBy(tasks.projectId, tasks.status)
  for (const row of rows) {
    const counts = result.get(row.projectId)
    if (counts) counts[row.status as TaskStatus] = Number(row.n)
  }
  return result
}

export function openCountOf(counts: TaskCountsByStatus): number {
  return TASK_STATUSES.filter(s => s !== 'done' && s !== 'cancelled').reduce((sum, s) => sum + counts[s], 0)
}
