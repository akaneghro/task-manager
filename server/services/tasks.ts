// Tasks: listing, detail, create/update/status/move/delete and the MCP project context.

import { and, asc, desc, eq, inArray, isNull, ne, notInArray, or, sql } from 'drizzle-orm'
import type { SQL, SQLWrapper } from 'drizzle-orm'
import { projectMembers, projects, taskChecklistItems, taskLinks, tasks, users } from '../db/schema'
import type { TaskRow } from '../db/schema'
import {
  createTaskSchema,
  listTasksQuerySchema,
  moveTaskSchema,
  setStatusSchema,
  updateTaskSchema,
} from '../../shared/schemas/task'
import type {
  AssigneeInput,
  BlockerInput,
  CreateTaskInput,
  ListTasksQuery,
  MoveTaskInput,
  SetStatusInput,
  TaskSort,
  UpdateTaskInput,
} from '../../shared/schemas/task'
import { ALL_PROJECTS, CLOSED_TASK_STATUSES, INBOX_PROJECT, PRIORITY_RANK, TASK_STATUSES } from '../../shared/utils/enums'
import type { ProjectStatus, TaskStatus } from '../../shared/utils/enums'
import { parseTaskKey } from '../../shared/utils/taskKey'
import { needsRebalance, positionBetween, rebalancedPositions } from '../../shared/utils/position'
import { wouldCreateCycle } from '../../shared/utils/dependencies'
import type { ProjectLinkDto, TaskCountsByStatus, TaskDetailDto, TaskListDto, TaskSummaryDto } from '../../shared/types/dto'
import { can } from '../../shared/utils/permissions'
import { actorSource, assertCan, because, nowOf, ServiceError } from './context'
import type { ServiceContext } from './context'
import { countTasksByStatus, emptyCounts, getVisibleProjectBySlug, openCountOf, visibleProjectIds } from './lookup'
import {
  buildTaskDetail,
  buildTaskSummaries,
  loadTaskWithProjectById,
  maxColumnPosition,
  parseServiceInput,
  projectInfoOf,
  resolveTaskWithProject,
  taskKeyOf,
  taskProjectColumns,
  todayOf,
} from './taskMappers'
import type { TaskWithProject } from './taskMappers'
import { addComment } from './comments'
import { IMMEDIATE, loadLiveBlockEdges, withBusyRetry } from './tx'
import { getProject } from './projects'

type TaskChanges = Partial<typeof tasks.$inferInsert>

export { parseServiceInput }

// ---------------------------------------------------------------------------------------------------------------
// Lookup

/** Resolves a task key (case-insensitive) or uuid to a visible, non-deleted task row. */
export async function resolveTaskRef(ctx: ServiceContext, ref: string): Promise<TaskRow> {
  return (await resolveTaskWithProject(ctx, ref)).task
}

// ---------------------------------------------------------------------------------------------------------------
// Listing

const PRIORITY_ORDER = sql`case ${tasks.priority} ${sql.raw(
  Object.entries(PRIORITY_RANK).map(([p, rank]) => `when '${p}' then ${rank}`).join(' '),
)} else 99 end`

const STATUS_ORDER = sql`case ${tasks.status} ${sql.raw(
  TASK_STATUSES.map((s, i) => `when '${s}' then ${i}`).join(' '),
)} else 99 end`

const DUE_NULLS_LAST = sql`(${tasks.dueDate} is null)`

const CLOSED_LAST = sql`(${tasks.status} in (${sql.join(CLOSED_TASK_STATUSES.map(s => sql`${s}`), sql`, `)}))`

function orderByFor(sort: TaskSort): SQL[] {
  switch (sort) {
    case 'priority':
      return [PRIORITY_ORDER, DUE_NULLS_LAST, asc(tasks.dueDate), asc(tasks.position), asc(projects.key), asc(tasks.number)]
    case 'due':
      return [DUE_NULLS_LAST, asc(tasks.dueDate), PRIORITY_ORDER, asc(tasks.position), asc(projects.key), asc(tasks.number)]
    case 'updated':
      return [desc(tasks.updatedAt), asc(projects.key), desc(tasks.number)]
    case 'created':
      return [desc(tasks.createdAt), asc(projects.key), desc(tasks.number)]
    case 'position':
      return [STATUS_ORDER, asc(tasks.position), asc(projects.key), asc(tasks.number)]
    case 'key':
      return [asc(projects.key), asc(tasks.number)]
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, ch => `\\${ch}`)
}

function likeEscaped(column: SQLWrapper, pattern: string): SQL {
  return sql`${column} like ${pattern} escape '\\'`
}

/**
 * Lists tasks of one visible project (`project` slug) or of every visible project (`all` / omitted).
 * Closed tasks are hidden unless `includeClosed` is set or a status filter is given.
 */
export async function listTasks(ctx: ServiceContext, query: ListTasksQuery): Promise<TaskListDto> {
  const q = parseServiceInput(listTasksQuerySchema, query)
  let projectIds: string[]
  if (q.project && q.project.toLowerCase() !== ALL_PROJECTS) {
    const project = await getVisibleProjectBySlug(ctx, q.project)
    assertCan(ctx, 'task.read', { projectId: project.id })
    projectIds = [project.id]
  }
  else {
    projectIds = await visibleProjectIds(ctx)
  }
  if (projectIds.length === 0) return { items: [], total: 0 }

  const conditions: SQL[] = [inArray(tasks.projectId, projectIds), isNull(tasks.deletedAt), isNull(projects.deletedAt)]
  if (q.status && q.status.length > 0) conditions.push(inArray(tasks.status, q.status))
  else if (!q.includeClosed) conditions.push(notInArray(tasks.status, [...CLOSED_TASK_STATUSES]))
  if (q.priority && q.priority.length > 0) conditions.push(inArray(tasks.priority, q.priority))
  if (q.type && q.type.length > 0) conditions.push(inArray(tasks.type, q.type))
  if (q.executor && q.executor.length > 0) conditions.push(inArray(tasks.executor, q.executor))
  if (q.assignee && q.assignee.length > 0) conditions.push(inArray(tasks.assigneeKind, q.assignee))
  if (q.dueBefore) conditions.push(sql`${tasks.dueDate} is not null and ${tasks.dueDate} <= ${q.dueBefore}`)
  if (q.q) {
    const pattern = `%${escapeLike(q.q)}%`
    const keyExpr = sql`(${projects.key} || '-' || ${tasks.number})`
    const matches: SQL[] = [
      likeEscaped(tasks.title, pattern),
      likeEscaped(tasks.description, pattern),
      likeEscaped(keyExpr, pattern),
    ]
    const parsedKey = parseTaskKey(q.q)
    if (parsedKey) {
      const exact = and(eq(projects.key, parsedKey.projectKey), eq(tasks.number, parsedKey.number))
      if (exact) matches.push(exact)
    }
    const any = or(...matches)
    if (any) conditions.push(any)
  }
  const where = and(...conditions)

  const [countRow] = await ctx.db.select({ n: sql<number>`count(*)` })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(where)
  const total = Number(countRow?.n ?? 0)

  const rows = await ctx.db.select({ task: tasks, project: taskProjectColumns })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(where)
    .orderBy(...(q.closedLast ? [CLOSED_LAST] : []), ...orderByFor(q.sort))
    .limit(q.limit)
    .offset(q.offset)

  const items = await buildTaskSummaries(ctx, rows)
  return { items, total }
}

export interface SearchTasksInput {
  query: string
  project?: string
  includeClosed?: boolean
  limit?: number
}

/** Free-text search (title, description, key) over visible tasks, most recently updated first. */
export async function searchTasks(ctx: ServiceContext, input: SearchTasksInput): Promise<TaskSummaryDto[]> {
  const query = parseServiceInput(listTasksQuerySchema, {
    q: input.query,
    project: input.project,
    includeClosed: input.includeClosed ?? false,
    limit: input.limit ?? 20,
    sort: 'updated',
  })
  return (await listTasks(ctx, query)).items
}

// ---------------------------------------------------------------------------------------------------------------
// Detail

export async function getTask(ctx: ServiceContext, ref: string): Promise<TaskDetailDto> {
  const item = await resolveTaskWithProject(ctx, ref)
  return buildTaskDetail(ctx, item)
}

async function reloadVisible(ctx: ServiceContext, taskId: string): Promise<TaskWithProject> {
  const item = await loadTaskWithProjectById(ctx.db, taskId)
  if (!item || item.task.deletedAt) throw new ServiceError('not_found', 'Task not found')
  return item
}

async function conflictError(ctx: ServiceContext, taskId: string): Promise<ServiceError> {
  const current = await reloadVisible(ctx, taskId)
  const detail = await buildTaskDetail(ctx, current)
  return new ServiceError(
    'conflict',
    `Task ${taskKeyOf(current)} was modified by ${current.task.updatedBy} at ${current.task.updatedAt.toISOString()}; re-read it and retry`,
    detail,
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Field mapping

/** Whether `userId` is an accepted, active member (invitation linked and not revoked) of the project. */
async function isActiveProjectMember(ctx: ServiceContext, projectId: string, userId: string): Promise<boolean> {
  const [row] = await ctx.db.select({ id: projectMembers.id })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId), isNull(projectMembers.revokedAt)))
    .limit(1)
  return row !== undefined
}

/**
 * User id of the accepted member of a project with this GitHub login (current login, or the login the invitation
 * was made for). Used by MCP, which names members by login. Throws `invalid` when there is none.
 */
export async function memberUserIdByLogin(ctx: ServiceContext, projectId: string, login: string): Promise<string> {
  const lower = login.trim().replace(/^@/, '').toLowerCase()
  const [row] = await ctx.db.select({ userId: users.id })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(and(
      eq(projectMembers.projectId, projectId),
      isNull(projectMembers.revokedAt),
      or(sql`lower(${users.githubLogin}) = ${lower}`, sql`lower(${projectMembers.githubLogin}) = ${lower}`),
    ))
    .limit(1)
  if (!row) {
    throw new ServiceError('invalid', `"${login}" is not an accepted member of this project; members are the GitHub users the owner invited who already signed in`, because('not_a_member'))
  }
  return row.userId
}

async function assigneeColumns(ctx: ServiceContext, assignee: AssigneeInput, projectId: string): Promise<TaskChanges> {
  switch (assignee.kind) {
    case 'member': {
      if (!await isActiveProjectMember(ctx, projectId, assignee.userId)) {
        throw new ServiceError('invalid', 'The assignee is not an accepted member of this project', because('not_a_member'))
      }
      return { assigneeKind: 'member', assigneeUserId: assignee.userId, assigneeExternal: null }
    }
    case 'external':
      return { assigneeKind: 'external', assigneeUserId: null, assigneeExternal: assignee.name }
    default:
      return { assigneeKind: assignee.kind, assigneeUserId: null, assigneeExternal: null }
  }
}

function blockerColumns(ctx: ServiceContext, blocker: BlockerInput | null, current?: TaskRow): TaskChanges {
  if (!blocker) return { blockerWho: null, blockerWhat: null, blockerSince: null }
  return {
    blockerWho: blocker.who,
    blockerWhat: blocker.what,
    blockerSince: blocker.since ?? current?.blockerSince ?? todayOf(ctx),
  }
}

/** Status change side effects: `completed_at` and moving the card to the bottom of the new column. */
async function statusColumns(ctx: ServiceContext, task: TaskRow, status: TaskStatus, position?: number): Promise<TaskChanges> {
  if (status === task.status) return {}
  const changes: TaskChanges = {
    status,
    completedAt: status === 'done' ? nowOf(ctx) : null,
  }
  changes.position = position ?? positionBetween(await maxColumnPosition(ctx.db, task.projectId, status), null)
  return changes
}

/**
 * Writes `changes` only if the row still has `expectedVersion` (race-safe), bumping version/updated_*.
 * Returns false when another writer got there first.
 */
async function versionedUpdate(ctx: ServiceContext, taskId: string, expectedVersion: number, changes: TaskChanges): Promise<boolean> {
  const updated = await ctx.db.update(tasks)
    .set({ ...changes, version: sql`${tasks.version} + 1`, updatedAt: nowOf(ctx), updatedBy: actorSource(ctx) })
    .where(and(eq(tasks.id, taskId), eq(tasks.version, expectedVersion), isNull(tasks.deletedAt)))
    .returning({ id: tasks.id })
  return updated.length > 0
}

// ---------------------------------------------------------------------------------------------------------------
// Create

function resolveCreateProjectSlug(ctx: ServiceContext, project: string | undefined): string {
  if (project) return project
  if (ctx.actor.kind === 'mcp' && ctx.actor.defaultProject) return ctx.actor.defaultProject
  return INBOX_PROJECT.slug
}

export async function createTask(ctx: ServiceContext, rawInput: CreateTaskInput): Promise<TaskDetailDto> {
  const input = parseServiceInput(createTaskSchema, rawInput)
  const project = await getVisibleProjectBySlug(ctx, resolveCreateProjectSlug(ctx, input.project))
  assertCan(ctx, 'task.write', { projectId: project.id })

  const assignee = input.assignee ? await assigneeColumns(ctx, input.assignee, project.id) : {}
  const blocker = input.blocker ? blockerColumns(ctx, input.blocker) : {}

  // Blocking tasks must be writable too (the link touches both tasks).
  const blockers: TaskWithProject[] = []
  for (const ref of input.blockedBy ?? []) {
    const blocking = await resolveTaskWithProject(ctx, ref)
    assertCan(ctx, 'task.write', { projectId: blocking.project.id })
    if (!blockers.some(b => b.task.id === blocking.task.id)) blockers.push(blocking)
  }

  const taskId = crypto.randomUUID()
  const now = nowOf(ctx)
  const source = actorSource(ctx)

  await withBusyRetry(() => ctx.db.transaction(async (tx) => {
    const [allocated] = await tx.update(projects)
      .set({ nextTaskNumber: sql`${projects.nextTaskNumber} + 1` })
      .where(eq(projects.id, project.id))
      .returning({ next: projects.nextTaskNumber })
    if (!allocated) throw new ServiceError('not_found', `Project "${project.slug}" not found`)
    const number = allocated.next - 1

    const [maxRow] = await tx.select({ max: sql<number | null>`max(${tasks.position})` })
      .from(tasks)
      .where(and(eq(tasks.projectId, project.id), eq(tasks.status, input.status), isNull(tasks.deletedAt)))
    const maxPosition = maxRow?.max === null || maxRow?.max === undefined ? null : Number(maxRow.max)

    await tx.insert(tasks).values({
      id: taskId,
      projectId: project.id,
      number,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      type: input.type,
      size: input.size ?? null,
      executor: input.executor,
      ...assignee,
      dueDate: input.dueDate ?? null,
      ...blocker,
      position: positionBetween(maxPosition, null),
      completedAt: input.status === 'done' ? now : null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: source,
      updatedBy: source,
    })

    const checklist = input.checklist ?? []
    if (checklist.length > 0) {
      const positions = rebalancedPositions(checklist.length)
      await tx.insert(taskChecklistItems).values(checklist.map((text, i) => ({
        taskId,
        text,
        position: positions[i] ?? (i + 1) * 1024,
        createdAt: now,
      })))
    }

    if (blockers.length > 0) {
      const edges = await loadLiveBlockEdges(tx)
      for (const blocking of blockers) {
        if (wouldCreateCycle(edges, blocking.task.id, taskId)) {
          throw new ServiceError('invalid', `Adding ${taskKeyOf(blocking)} as a blocker would create a dependency cycle`, because('dependency_cycle'))
        }
        edges.push({ from: blocking.task.id, to: taskId })
      }
      await tx.insert(taskLinks).values(blockers.map(b => ({
        fromTaskId: b.task.id,
        toTaskId: taskId,
        type: 'blocks' as const,
        createdAt: now,
        createdBy: source,
      })))
    }
  }, IMMEDIATE))

  return buildTaskDetail(ctx, await reloadVisible(ctx, taskId))
}

// ---------------------------------------------------------------------------------------------------------------
// Update / status / move / delete

export async function updateTask(ctx: ServiceContext, ref: string, rawInput: UpdateTaskInput): Promise<TaskDetailDto> {
  const item = await resolveTaskWithProject(ctx, ref)
  assertCan(ctx, 'task.write', { projectId: item.project.id })
  const { expectedVersion, patch } = parseServiceInput(updateTaskSchema, rawInput)
  const task = item.task
  if (task.version !== expectedVersion) throw await conflictError(ctx, task.id)

  const changes: TaskChanges = {}
  if (patch.title !== undefined) changes.title = patch.title
  if (patch.description !== undefined) changes.description = patch.description
  if (patch.priority !== undefined) changes.priority = patch.priority
  if (patch.type !== undefined) changes.type = patch.type
  if (patch.size !== undefined) changes.size = patch.size
  if (patch.executor !== undefined) changes.executor = patch.executor
  if (patch.dueDate !== undefined) changes.dueDate = patch.dueDate
  if (patch.assignee !== undefined) Object.assign(changes, await assigneeColumns(ctx, patch.assignee, item.project.id))
  if (patch.blocker !== undefined) Object.assign(changes, blockerColumns(ctx, patch.blocker, task))
  if (patch.status !== undefined) Object.assign(changes, await statusColumns(ctx, task, patch.status))

  if (Object.keys(changes).length === 0) return buildTaskDetail(ctx, item)
  if (!await versionedUpdate(ctx, task.id, expectedVersion, changes)) throw await conflictError(ctx, task.id)
  return buildTaskDetail(ctx, await reloadVisible(ctx, task.id))
}

/**
 * Changes only the status (+ third-party blocker when given). Without `expectedVersion` the last write wins.
 * `note` is stored as a comment by the actor.
 */
export async function setTaskStatus(ctx: ServiceContext, ref: string, rawInput: SetStatusInput): Promise<TaskDetailDto> {
  let item = await resolveTaskWithProject(ctx, ref)
  assertCan(ctx, 'task.write', { projectId: item.project.id })
  const input = parseServiceInput(setStatusSchema, rawInput)
  if (input.expectedVersion !== undefined && item.task.version !== input.expectedVersion) {
    throw await conflictError(ctx, item.task.id)
  }

  for (let attempt = 0; ; attempt++) {
    const task = item.task
    const changes: TaskChanges = await statusColumns(ctx, task, input.status)
    if (input.blocker !== undefined) Object.assign(changes, blockerColumns(ctx, input.blocker, task))
    if (Object.keys(changes).length === 0) break
    const expected = input.expectedVersion ?? task.version
    if (await versionedUpdate(ctx, task.id, expected, changes)) break
    if (input.expectedVersion !== undefined || attempt >= 3) throw await conflictError(ctx, task.id)
    item = await reloadVisible(ctx, task.id)
  }

  if (input.note) await addComment(ctx, item.task.id, input.note)
  return buildTaskDetail(ctx, await reloadVisible(ctx, item.task.id))
}

class MoveConflict extends Error {}

/**
 * Kanban move: places the task between `beforeId` (above) and `afterId` (below) in the `status` column,
 * rebalancing the column when the gap is exhausted.
 */
export async function moveTask(ctx: ServiceContext, ref: string, rawInput: MoveTaskInput): Promise<TaskSummaryDto> {
  const item = await resolveTaskWithProject(ctx, ref)
  assertCan(ctx, 'task.write', { projectId: item.project.id })
  const input = parseServiceInput(moveTaskSchema, rawInput)
  const task = item.task
  if (task.version !== input.expectedVersion) throw await conflictError(ctx, task.id)

  const neighbourIds = [input.beforeId, input.afterId].filter((v): v is string => typeof v === 'string')
  const neighbours = neighbourIds.length === 0
    ? []
    : await ctx.db.select({ id: tasks.id, position: tasks.position })
        .from(tasks)
        .where(and(
          inArray(tasks.id, neighbourIds),
          eq(tasks.projectId, task.projectId),
          eq(tasks.status, input.status),
          isNull(tasks.deletedAt),
          ne(tasks.id, task.id),
        ))
  const before = input.beforeId ? neighbours.find(n => n.id === input.beforeId) : undefined
  const after = input.afterId ? neighbours.find(n => n.id === input.afterId) : undefined
  const rebalance = before !== undefined && after !== undefined
    && (needsRebalance(before.position, after.position) || before.position >= after.position)

  const statusChanges: TaskChanges = input.status === task.status
    ? {}
    : { status: input.status, completedAt: input.status === 'done' ? nowOf(ctx) : null }

  if (!rebalance) {
    let position = positionBetween(before?.position, after?.position)
    if (!before && !after) {
      position = positionBetween(await maxColumnPosition(ctx.db, task.projectId, input.status), null)
    }
    const ok = await versionedUpdate(ctx, task.id, input.expectedVersion, { ...statusChanges, position })
    if (!ok) throw await conflictError(ctx, task.id)
  }
  else {
    try {
      await withBusyRetry(() => ctx.db.transaction(async (tx) => {
        const column = await tx.select({ id: tasks.id })
          .from(tasks)
          .where(and(
            eq(tasks.projectId, task.projectId),
            eq(tasks.status, input.status),
            isNull(tasks.deletedAt),
            ne(tasks.id, task.id),
          ))
          .orderBy(asc(tasks.position), asc(tasks.number))
        const ids = column.map(c => c.id)
        const index = ids.indexOf(before.id)
        ids.splice(index + 1, 0, task.id)
        const positions = rebalancedPositions(ids.length)
        const now = nowOf(ctx)
        const moved = await tx.update(tasks)
          .set({
            ...statusChanges,
            position: positions[index + 1] ?? 0,
            version: sql`${tasks.version} + 1`,
            updatedAt: now,
            updatedBy: actorSource(ctx),
          })
          .where(and(eq(tasks.id, task.id), eq(tasks.version, input.expectedVersion), isNull(tasks.deletedAt)))
          .returning({ id: tasks.id })
        if (moved.length === 0) throw new MoveConflict()
        for (const [i, id] of ids.entries()) {
          if (id === task.id) continue
          await tx.update(tasks).set({ position: positions[i] ?? 0 }).where(eq(tasks.id, id))
        }
      }, IMMEDIATE))
    }
    catch (error) {
      if (error instanceof MoveConflict) throw await conflictError(ctx, task.id)
      throw error
    }
  }

  const [summary] = await buildTaskSummaries(ctx, [await reloadVisible(ctx, task.id)])
  if (!summary) throw new ServiceError('not_found', 'Task not found')
  return summary
}

/** Soft delete. */
export async function deleteTask(ctx: ServiceContext, ref: string): Promise<void> {
  const item = await resolveTaskWithProject(ctx, ref)
  assertCan(ctx, 'task.delete', { projectId: item.project.id })
  const now = nowOf(ctx)
  await ctx.db.update(tasks)
    .set({ deletedAt: now, updatedAt: now, updatedBy: actorSource(ctx) })
    .where(eq(tasks.id, item.task.id))
}

// ---------------------------------------------------------------------------------------------------------------
// MCP context

export interface ProjectContextSummaryDto {
  id: string
  slug: string
  key: string
  name: string
  description: string
  status: ProjectStatus
  isInbox: boolean
  counts: TaskCountsByStatus
  openCount: number
  /** Markdown notes (durable knowledge recorded by earlier sessions). Empty when the actor cannot read them. */
  notes: string
  links: ProjectLinkDto[]
}

export interface ProjectContextDto {
  project: ProjectContextSummaryDto
  inProgress: TaskSummaryDto[]
  /**
   * Up to 5 `todo` tasks that can be started now (no open "blocked by" dependency), executor ai/mixed first,
   * then by priority and due date.
   */
  nextUp: TaskSummaryDto[]
  blocked: TaskSummaryDto[]
  inReview: TaskSummaryDto[]
}

const CONTEXT_LIST_LIMIT = 20
const NEXT_UP_LIMIT = 5
/** How many `todo` tasks are scanned to find the next-up candidates. */
const NEXT_UP_SCAN = 100

/** Startable todo tasks (no open blockers), work Claude can do (ai/mixed) first, keeping the priority order. */
export function pickNextUp(todo: readonly TaskSummaryDto[], limit = NEXT_UP_LIMIT): TaskSummaryDto[] {
  const startable = todo.filter(t => t.blockedByKeys.length === 0)
  const forClaude = startable.filter(t => t.executor !== 'human')
  const forHuman = startable.filter(t => t.executor === 'human')
  return [...forClaude, ...forHuman].slice(0, limit)
}

/** Snapshot of a project for the MCP `get_context` tool (defaults to the session project, then the Inbox). */
export async function getProjectContext(ctx: ServiceContext, slug?: string): Promise<ProjectContextDto> {
  const projectSlug = slug ?? (ctx.actor.kind === 'mcp' ? ctx.actor.defaultProject : null) ?? INBOX_PROJECT.slug
  const project = await getVisibleProjectBySlug(ctx, projectSlug)
  assertCan(ctx, 'task.read', { projectId: project.id })
  const counts = (await countTasksByStatus(ctx.db, [project.id])).get(project.id) ?? emptyCounts()

  const list = async (status: TaskStatus, limit: number) => (await listTasks(ctx, parseServiceInput(listTasksQuerySchema, {
    project: project.slug,
    status: [status],
    sort: 'priority',
    limit,
  }))).items

  const [inProgress, todo, blocked, inReview] = await Promise.all([
    list('in_progress', CONTEXT_LIST_LIMIT),
    list('todo', NEXT_UP_SCAN),
    list('blocked', CONTEXT_LIST_LIMIT),
    list('in_review', CONTEXT_LIST_LIMIT),
  ])
  const nextUp = pickNextUp(todo)
  const detail = can(ctx.actor, 'project.readNotes', { projectId: project.id }) ? await getProject(ctx, project.slug) : null
  const info = projectInfoOf(project)
  return {
    project: {
      ...info,
      description: project.description,
      status: project.status,
      isInbox: project.isInbox,
      counts,
      openCount: openCountOf(counts),
      notes: detail?.notes ?? '',
      links: detail?.links ?? [],
    },
    inProgress,
    nextUp,
    blocked,
    inReview,
  }
}
