// "Blocked by" dependencies between tasks (`task_links` rows of type `blocks`: from blocks to).

import { and, eq } from 'drizzle-orm'
import { taskLinks, tasks } from '../db/schema'
import { wouldCreateCycle } from '../../shared/utils/dependencies'
import { can } from '../../shared/utils/permissions'
import type { TaskDetailDto } from '../../shared/types/dto'
import { actorSource, assertCan, because, nowOf, ServiceError } from './context'
import type { ServiceContext } from './context'
import {
  buildTaskDetail,
  loadTaskWithProjectById,
  resolveTaskWithProject,
  taskKeyOf,
  touchTask,
} from './taskMappers'
import type { TaskWithProject } from './taskMappers'
import { IMMEDIATE, loadLiveBlockEdges, withBusyRetry } from './tx'

async function resolvePair(ctx: ServiceContext, ref: string, blockedByRef: string): Promise<{ task: TaskWithProject, blocker: TaskWithProject }> {
  const task = await resolveTaskWithProject(ctx, ref)
  const blocker = await resolveTaskWithProject(ctx, blockedByRef)
  assertCan(ctx, 'task.write', { projectId: task.project.id })
  assertCan(ctx, 'task.write', { projectId: blocker.project.id })
  return { task, blocker }
}

/** Records that `blockedByRef` blocks `ref`. Self links and cycles are rejected; duplicates are no-ops. */
export async function addBlockedBy(ctx: ServiceContext, ref: string, blockedByRef: string): Promise<TaskDetailDto> {
  const { task, blocker } = await resolvePair(ctx, ref, blockedByRef)
  if (task.task.id === blocker.task.id) throw new ServiceError('invalid', 'A task cannot block itself', because('self_link'))

  // Edge read, cycle check and insert run in one IMMEDIATE transaction: two concurrent opposite links
  // (A blocks B / B blocks A) cannot both pass the check against the same old edge set.
  await withBusyRetry(() => ctx.db.transaction(async (tx) => {
    const edges = await loadLiveBlockEdges(tx)
    if (edges.some(e => e.from === blocker.task.id && e.to === task.task.id)) return
    if (wouldCreateCycle(edges, blocker.task.id, task.task.id)) {
      throw new ServiceError(
        'invalid',
        `${taskKeyOf(blocker)} cannot block ${taskKeyOf(task)}: it would create a dependency cycle`,
        because('dependency_cycle'),
      )
    }
    const now = nowOf(ctx)
    await tx.insert(taskLinks).values({
      fromTaskId: blocker.task.id,
      toTaskId: task.task.id,
      type: 'blocks',
      createdAt: now,
      createdBy: actorSource(ctx),
    }).onConflictDoNothing()
    await tx.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, task.task.id))
  }, IMMEDIATE))
  return buildTaskDetail(ctx, await resolveTaskWithProject(ctx, task.task.id))
}

/** Removes the "blocked by" link if present (no-op otherwise). */
export async function removeBlockedBy(ctx: ServiceContext, ref: string, blockedByRef: string): Promise<TaskDetailDto> {
  const { task, blocker } = await resolvePair(ctx, ref, blockedByRef)
  const removed = await ctx.db.delete(taskLinks)
    .where(and(eq(taskLinks.fromTaskId, blocker.task.id), eq(taskLinks.toTaskId, task.task.id), eq(taskLinks.type, 'blocks')))
    .returning({ id: taskLinks.id })
  if (removed.length > 0) await touchTask(ctx, task.task.id)
  return buildTaskDetail(ctx, await resolveTaskWithProject(ctx, task.task.id))
}

/** Deletes a link by id. Requires `task.write` on both ends. */
export async function deleteTaskLink(ctx: ServiceContext, linkId: string): Promise<void> {
  const [link] = await ctx.db.select().from(taskLinks).where(eq(taskLinks.id, linkId)).limit(1)
  const from = link ? await loadTaskWithProjectById(ctx.db, link.fromTaskId) : null
  const to = link ? await loadTaskWithProjectById(ctx.db, link.toTaskId) : null
  const visible = (item: TaskWithProject | null) => item !== null && can(ctx.actor, 'task.read', { projectId: item.project.id })
  if (!link || !from || !to || !visible(from) || !visible(to)) throw new ServiceError('not_found', 'Task link not found')
  assertCan(ctx, 'task.write', { projectId: from.project.id })
  assertCan(ctx, 'task.write', { projectId: to.project.id })
  await ctx.db.delete(taskLinks).where(eq(taskLinks.id, link.id))
  await touchTask(ctx, to.task.id)
}
