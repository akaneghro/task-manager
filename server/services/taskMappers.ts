// Shared task plumbing: ref resolution, row -> DTO mapping with batched aggregates, comment mapping.
// Kept separate from tasks.ts so checklist/comments/taskLinks can use it without import cycles.

import { and, asc, desc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { Db } from '../db'
import { comments, projects, taskChecklistItems, taskLinks, tasks, users } from '../db/schema'
import type { ChecklistItemRow, CommentRow, ProjectRow, TaskRow } from '../db/schema'
import { CLOSED_TASK_STATUSES } from '../../shared/utils/enums'
import { formatTaskKey, isUuid, parseTaskKey } from '../../shared/utils/taskKey'
import { can, canSeeProject, projectCapabilities } from '../../shared/utils/permissions'
import type {
  AssigneeDto,
  BlockerDto,
  ChecklistItemDto,
  CommentDto,
  TaskDetailDto,
  TaskLinkRefDto,
  TaskSummaryDto,
} from '../../shared/types/dto'
import { findProjectRowById, findProjectRowByKey, visibleProjectIds } from './lookup'
import { DEFAULT_TIME_ZONE, ServiceError, nowOf } from './context'
import type { ServiceContext } from './context'

/** Minimal project data needed to render a task. */
export interface TaskProjectInfo {
  id: string
  slug: string
  key: string
  name: string
}

export interface TaskWithProject {
  task: TaskRow
  project: TaskProjectInfo
}

/** Columns selected for `TaskProjectInfo` in joins. */
export const taskProjectColumns = {
  id: projects.id,
  slug: projects.slug,
  key: projects.key,
  name: projects.name,
}

export function iso(date: Date): string {
  return date.toISOString()
}

export function isoOrNull(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null
}

function calendarDateIn(date: Date, timeZone: string): string | null {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  }
  catch {
    return null // unknown time zone
  }
}

/**
 * Today as `YYYY-MM-DD` in the configured time zone (`ctx.timeZone`, default `DEFAULT_TIME_ZONE`) according to
 * the context clock, so server defaults match the local calendar date the UI uses. Falls back to UTC when the
 * zone is invalid.
 */
export function todayOf(ctx: ServiceContext): string {
  const now = nowOf(ctx)
  return calendarDateIn(now, ctx.timeZone || DEFAULT_TIME_ZONE) ?? now.toISOString().slice(0, 10)
}

export function projectInfoOf(row: ProjectRow): TaskProjectInfo {
  return { id: row.id, slug: row.slug, key: row.key, name: row.name }
}

export function taskKeyOf(item: TaskWithProject): string {
  return formatTaskKey(item.project.key, item.task.number)
}

function notFound(ref: string): ServiceError {
  return new ServiceError('not_found', `Task "${ref}" not found`)
}

/**
 * Resolves a task key (`abc-12`, case-insensitive) or uuid to a non-deleted task in a non-deleted project the
 * actor can see. Throws `not_found` otherwise (no information leak).
 */
export async function resolveTaskWithProject(ctx: ServiceContext, ref: string): Promise<TaskWithProject> {
  const trimmed = ref.trim()
  const parsed = parseTaskKey(trimmed)
  let task: TaskRow | undefined
  let project: ProjectRow | null = null
  if (parsed) {
    project = await findProjectRowByKey(ctx.db, parsed.projectKey)
    if (!project) throw notFound(trimmed)
    const [row] = await ctx.db.select().from(tasks)
      .where(and(eq(tasks.projectId, project.id), eq(tasks.number, parsed.number), isNull(tasks.deletedAt)))
      .limit(1)
    task = row
  }
  else if (isUuid(trimmed)) {
    const [row] = await ctx.db.select().from(tasks)
      .where(and(eq(tasks.id, trimmed.toLowerCase()), isNull(tasks.deletedAt)))
      .limit(1)
    task = row
    if (task) project = await findProjectRowById(ctx.db, task.projectId)
  }
  if (!task || !project || !canSeeProject(ctx.actor, project.id) || !can(ctx.actor, 'task.read', { projectId: project.id })) {
    throw notFound(trimmed)
  }
  return { task, project: projectInfoOf(project) }
}

/** Re-reads a task row (even soft-deleted) of a non-deleted project by id. No visibility check. */
export async function loadTaskWithProjectById(db: Db, taskId: string): Promise<TaskWithProject | null> {
  const [row] = await db.select({ task: tasks, project: taskProjectColumns })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(tasks.id, taskId), isNull(projects.deletedAt)))
    .limit(1)
  return row ?? null
}

/** Bumps `updated_at` of a task without touching its version (checklist, comments, links). */
export async function touchTask(ctx: ServiceContext, taskId: string): Promise<void> {
  await ctx.db.update(tasks).set({ updatedAt: nowOf(ctx) }).where(eq(tasks.id, taskId))
}

/** Highest position in a kanban column (project + status), or null for an empty column. */
export async function maxColumnPosition(db: Pick<Db, 'select'>, projectId: string, status: TaskRow['status']): Promise<number | null> {
  const [row] = await db.select({ max: sql<number | null>`max(${tasks.position})` })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), eq(tasks.status, status), isNull(tasks.deletedAt)))
  const value = row?.max
  return value === null || value === undefined ? null : Number(value)
}

/** Validates service input with a shared zod schema, converting failures into `ServiceError('invalid')`. */
export function parseServiceInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input)
  if (!result.success) {
    const message = result.error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')
    throw new ServiceError('invalid', message, result.error.issues)
  }
  return result.data
}

// ---------------------------------------------------------------------------------------------------------------
// Summaries

function blockerOf(task: TaskRow): BlockerDto | null {
  if (!task.blockerWho || !task.blockerWhat) return null
  return { who: task.blockerWho, what: task.blockerWhat, since: task.blockerSince ?? null }
}

/**
 * Public share links never see internal actor identifiers (user ids, API token names): sources are reduced to
 * `mcp:` (Claude) or `user:` (a person), with no id or name.
 */
export function publicSource(source: string): string {
  return source.startsWith('mcp:') ? 'mcp:' : 'user:'
}

function assigneeOf(task: TaskRow, logins: ReadonlyMap<string, string>, isPublic: boolean): AssigneeDto {
  switch (task.assigneeKind) {
    case 'member':
      // Public links do not learn which GitHub accounts collaborate on the project.
      if (isPublic) return { kind: 'member', userId: null, name: null }
      return {
        kind: 'member',
        userId: task.assigneeUserId ?? null,
        name: task.assigneeUserId ? (logins.get(task.assigneeUserId) ?? null) : null,
      }
    case 'external':
      return { kind: 'external', userId: null, name: task.assigneeExternal ?? null }
    default:
      return { kind: task.assigneeKind, userId: null, name: null }
  }
}

/** Builds summaries for many tasks with a constant number of aggregate queries. */
export async function buildTaskSummaries(
  ctx: ServiceContext,
  items: readonly TaskWithProject[],
  visibleIds?: readonly string[],
): Promise<TaskSummaryDto[]> {
  if (items.length === 0) return []
  const db = ctx.db
  const taskIds = items.map(i => i.task.id)
  const visible = visibleIds ?? await visibleProjectIds(ctx)
  const isPublic = ctx.actor.kind === 'public'

  const checklistRows = await db.select({
    taskId: taskChecklistItems.taskId,
    total: sql<number>`count(*)`,
    done: sql<number>`coalesce(sum(case when ${taskChecklistItems.done} then 1 else 0 end), 0)`,
  })
    .from(taskChecklistItems)
    .where(inArray(taskChecklistItems.taskId, taskIds))
    .groupBy(taskChecklistItems.taskId)
  const checklist = new Map(checklistRows.map(r => [r.taskId, { total: Number(r.total), done: Number(r.done) }]))

  const commentRows = await db.select({ taskId: comments.taskId, n: sql<number>`count(*)` })
    .from(comments)
    .where(and(inArray(comments.taskId, taskIds), isNull(comments.deletedAt)))
    .groupBy(comments.taskId)
  const commentCounts = new Map(commentRows.map(r => [r.taskId, Number(r.n)]))

  const blockedBy = new Map<string, string[]>()
  if (visible.length > 0) {
    const blockerRows = await db.select({
      toTaskId: taskLinks.toTaskId,
      projectKey: projects.key,
      number: tasks.number,
    })
      .from(taskLinks)
      .innerJoin(tasks, eq(tasks.id, taskLinks.fromTaskId))
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(
        inArray(taskLinks.toTaskId, taskIds),
        eq(taskLinks.type, 'blocks'),
        isNull(tasks.deletedAt),
        isNull(projects.deletedAt),
        notInArray(tasks.status, [...CLOSED_TASK_STATUSES]),
        inArray(tasks.projectId, [...visible]),
      ))
      .orderBy(asc(projects.key), asc(tasks.number))
    for (const row of blockerRows) {
      const key = formatTaskKey(row.projectKey, row.number)
      const list = blockedBy.get(row.toTaskId)
      if (list) list.push(key)
      else blockedBy.set(row.toTaskId, [key])
    }
  }

  const memberIds = [...new Set(items.map(i => i.task.assigneeUserId).filter((v): v is string => typeof v === 'string'))]
  const logins = new Map<string, string>()
  if (memberIds.length > 0 && !isPublic) {
    const rows = await db.select({ id: users.id, login: users.githubLogin }).from(users).where(inArray(users.id, memberIds))
    for (const row of rows) logins.set(row.id, row.login)
  }

  return items.map(({ task, project }) => {
    const counts = checklist.get(task.id)
    return {
      id: task.id,
      key: formatTaskKey(project.key, task.number),
      number: task.number,
      projectId: project.id,
      projectSlug: project.slug,
      projectKey: project.key,
      projectName: project.name,
      title: task.title,
      status: task.status,
      priority: task.priority,
      type: task.type,
      size: task.size ?? null,
      executor: task.executor,
      assignee: assigneeOf(task, logins, isPublic),
      dueDate: task.dueDate ?? null,
      blocker: blockerOf(task),
      position: task.position,
      version: task.version,
      checklistDone: counts?.done ?? 0,
      checklistTotal: counts?.total ?? 0,
      blockedByKeys: blockedBy.get(task.id) ?? [],
      commentCount: commentCounts.get(task.id) ?? 0,
      completedAt: isoOrNull(task.completedAt),
      createdAt: iso(task.createdAt),
      updatedAt: iso(task.updatedAt),
      createdBy: isPublic ? publicSource(task.createdBy) : task.createdBy,
      updatedBy: isPublic ? publicSource(task.updatedBy) : task.updatedBy,
    }
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Checklist & comments mapping

export function toChecklistItemDto(row: ChecklistItemRow): ChecklistItemDto {
  return {
    id: row.id,
    text: row.text,
    done: row.done,
    position: row.position,
    doneAt: isoOrNull(row.doneAt),
    doneBy: row.doneBy ?? null,
  }
}

export async function loadChecklist(db: Db, taskId: string): Promise<ChecklistItemDto[]> {
  const rows = await db.select().from(taskChecklistItems)
    .where(eq(taskChecklistItems.taskId, taskId))
    .orderBy(asc(taskChecklistItems.position), asc(taskChecklistItems.createdAt), asc(taskChecklistItems.id))
  return rows.map(toChecklistItemDto)
}

/**
 * Whether the viewer may edit/delete a comment: the owner moderates everything; a member may edit their own
 * comments (written as `user:<id>`) while they can still comment; MCP tokens and public links never can.
 */
export function canEditComment(ctx: ServiceContext, comment: Pick<CommentRow, 'authorUserId' | 'authorSource'>, projectId: string): boolean {
  const actor = ctx.actor
  if (actor.kind === 'mcp' || actor.kind === 'public') return false
  if (can(actor, 'comment.moderate', { projectId })) return true
  return comment.authorUserId === actor.userId
    && comment.authorSource === `user:${actor.userId}`
    && can(actor, 'comment.write', { projectId })
}

export interface CommentWithAuthor {
  comment: CommentRow
  login: string | null
  avatarUrl: string | null
}

export function toCommentDto(ctx: ServiceContext, row: CommentWithAuthor, projectId: string): CommentDto {
  const c = row.comment
  return {
    id: c.id,
    taskId: c.taskId,
    authorSource: c.authorSource,
    author: { login: row.login, avatarUrl: row.avatarUrl, isClaude: c.authorSource.startsWith('mcp:') },
    body: c.body,
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
    canEdit: canEditComment(ctx, c, projectId),
  }
}

const commentSelection = {
  comment: comments,
  login: users.githubLogin,
  avatarUrl: users.avatarUrl,
}

/** Non-deleted comments of a task in ascending order. With `last`, only the most recent N. */
export async function loadComments(ctx: ServiceContext, taskId: string, projectId: string, last?: number): Promise<CommentDto[]> {
  const base = ctx.db.select(commentSelection)
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorUserId))
    .where(and(eq(comments.taskId, taskId), isNull(comments.deletedAt)))
  const rows = last === undefined
    ? await base.orderBy(asc(comments.createdAt), asc(comments.id))
    : (await base.orderBy(desc(comments.createdAt), desc(comments.id)).limit(last)).reverse()
  return rows.map(r => toCommentDto(ctx, r, projectId))
}

export async function loadCommentById(ctx: ServiceContext, commentId: string): Promise<CommentWithAuthor | null> {
  const [row] = await ctx.db.select(commentSelection)
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorUserId))
    .where(and(eq(comments.id, commentId), isNull(comments.deletedAt)))
    .limit(1)
  return row ?? null
}

/** Inserts a comment (permission checks are the caller's job) and bumps the task's `updated_at`. */
export async function insertComment(ctx: ServiceContext, item: TaskWithProject, body: string): Promise<CommentDto> {
  const actor = ctx.actor
  const now = nowOf(ctx)
  const authorUserId = actor.kind === 'public' ? null : actor.userId
  const [row] = await ctx.db.insert(comments).values({
    taskId: item.task.id,
    authorUserId,
    authorSource: actor.source,
    body,
    createdAt: now,
    updatedAt: now,
  }).returning()
  if (!row) throw new Error('Failed to insert comment')
  await touchTask(ctx, item.task.id)
  const loaded = await loadCommentById(ctx, row.id)
  if (!loaded) throw new Error('Failed to reload comment')
  return toCommentDto(ctx, loaded, item.project.id)
}

// ---------------------------------------------------------------------------------------------------------------
// Detail

const COMMENTS_IN_DETAIL = 100

async function loadLinkRefs(
  ctx: ServiceContext,
  taskId: string,
  direction: 'blockedBy' | 'blocking',
  visible: ReadonlySet<string>,
): Promise<{ refs: TaskLinkRefDto[], hidden: number }> {
  const otherId = direction === 'blockedBy' ? taskLinks.fromTaskId : taskLinks.toTaskId
  const selfId = direction === 'blockedBy' ? taskLinks.toTaskId : taskLinks.fromTaskId
  const rows = await ctx.db.select({
    linkId: taskLinks.id,
    taskId: tasks.id,
    number: tasks.number,
    title: tasks.title,
    status: tasks.status,
    projectId: projects.id,
    projectKey: projects.key,
    projectSlug: projects.slug,
  })
    .from(taskLinks)
    .innerJoin(tasks, eq(tasks.id, otherId))
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(selfId, taskId), eq(taskLinks.type, 'blocks'), isNull(tasks.deletedAt), isNull(projects.deletedAt)))
    .orderBy(asc(projects.key), asc(tasks.number))
  const refs: TaskLinkRefDto[] = []
  let hidden = 0
  for (const row of rows) {
    if (!visible.has(row.projectId)) {
      hidden++
      continue
    }
    refs.push({
      linkId: row.linkId,
      taskId: row.taskId,
      key: formatTaskKey(row.projectKey, row.number),
      title: row.title,
      status: row.status,
      projectSlug: row.projectSlug,
    })
  }
  return { refs, hidden }
}

export async function buildTaskDetail(ctx: ServiceContext, item: TaskWithProject): Promise<TaskDetailDto> {
  const visibleIds = await visibleProjectIds(ctx)
  const visible = new Set(visibleIds)
  const [summary] = await buildTaskSummaries(ctx, [item], visibleIds)
  if (!summary) throw new Error('Failed to build task summary')
  const projectId = item.project.id
  const [loadedChecklist, blockedBy, blocking] = await Promise.all([
    loadChecklist(ctx.db, item.task.id),
    loadLinkRefs(ctx, item.task.id, 'blockedBy', visible),
    loadLinkRefs(ctx, item.task.id, 'blocking', visible),
  ])
  const isPublic = ctx.actor.kind === 'public'
  const checklist = isPublic
    ? loadedChecklist.map(i => ({ ...i, doneBy: i.doneBy ? publicSource(i.doneBy) : null }))
    : loadedChecklist
  const commentList = can(ctx.actor, 'comment.read', { projectId })
    ? await loadComments(ctx, item.task.id, projectId, COMMENTS_IN_DETAIL)
    : []
  const detail: TaskDetailDto = {
    ...summary,
    description: item.task.description,
    checklist,
    blockedBy: blockedBy.refs,
    blocking: blocking.refs,
    hiddenDependencies: isPublic ? 0 : blockedBy.hidden + blocking.hidden,
    comments: commentList,
  }
  if (!isPublic) detail.capabilities = projectCapabilities(ctx.actor, projectId)
  return detail
}
