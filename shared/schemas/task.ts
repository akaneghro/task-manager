import { z } from 'zod'
import { ASSIGNEE_KINDS, TASK_EXECUTORS, TASK_PRIORITIES, TASK_SIZES, TASK_STATUSES, TASK_TYPES } from '../utils/enums'
import { dateOnlySchema, idSchema, queryBoolean, queryEnumList, taskRefSchema, versionSchema } from './common'

export const assigneeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('owner') }),
  z.object({ kind: z.literal('claude') }),
  z.object({ kind: z.literal('member'), userId: idSchema }),
  z.object({ kind: z.literal('external'), name: z.string().trim().min(1).max(120) }),
])
export type AssigneeInput = z.infer<typeof assigneeSchema>

/** Waiting on a third party (client, provider...). */
export const blockerSchema = z.object({
  who: z.string().trim().min(1).max(120),
  what: z.string().trim().min(1).max(500),
  since: dateOnlySchema.optional(),
})
export type BlockerInput = z.infer<typeof blockerSchema>

export const taskTitleSchema = z.string().trim().min(1).max(200)

export const createTaskSchema = z.object({
  /** Project slug. Defaults to the Inbox (REST) or the session default project (MCP). */
  project: z.string().trim().min(1).optional(),
  title: taskTitleSchema,
  description: z.string().max(100_000).default(''),
  status: z.enum(TASK_STATUSES).default('todo'),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  type: z.enum(TASK_TYPES).default('feature'),
  size: z.enum(TASK_SIZES).nullish(),
  executor: z.enum(TASK_EXECUTORS).default('ai'),
  assignee: assigneeSchema.optional(),
  dueDate: dateOnlySchema.nullish(),
  blocker: blockerSchema.nullish(),
  checklist: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
  blockedBy: z.array(taskRefSchema).max(20).optional(),
})
export type CreateTaskInput = z.input<typeof createTaskSchema>

/** Scalar task fields that bump `version`. */
export const taskPatchSchema = z.object({
  title: taskTitleSchema.optional(),
  description: z.string().max(100_000).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  type: z.enum(TASK_TYPES).optional(),
  size: z.enum(TASK_SIZES).nullable().optional(),
  executor: z.enum(TASK_EXECUTORS).optional(),
  assignee: assigneeSchema.optional(),
  dueDate: dateOnlySchema.nullable().optional(),
  blocker: blockerSchema.nullable().optional(),
})
export type TaskPatch = z.input<typeof taskPatchSchema>

export const updateTaskSchema = z.object({
  expectedVersion: versionSchema,
  patch: taskPatchSchema,
})
export type UpdateTaskInput = z.input<typeof updateTaskSchema>

export const setStatusSchema = z.object({
  status: z.enum(TASK_STATUSES),
  /** When omitted only the status is written (last write wins). */
  expectedVersion: versionSchema.optional(),
  /** Optional note stored as a comment. */
  note: z.string().trim().max(10_000).optional(),
  blocker: blockerSchema.nullish(),
})
export type SetStatusInput = z.input<typeof setStatusSchema>

/** Kanban move: new status and neighbours in the target column. */
export const moveTaskSchema = z.object({
  status: z.enum(TASK_STATUSES),
  beforeId: idSchema.nullish(),
  afterId: idSchema.nullish(),
  expectedVersion: versionSchema,
})
export type MoveTaskInput = z.input<typeof moveTaskSchema>

export const TASK_SORTS = ['priority', 'due', 'updated', 'created', 'position', 'key'] as const
export type TaskSort = (typeof TASK_SORTS)[number]

export const listTasksQuerySchema = z.object({
  /** Project slug, or `all` / omitted for every visible project. */
  project: z.string().trim().min(1).optional(),
  status: queryEnumList(TASK_STATUSES).optional(),
  priority: queryEnumList(TASK_PRIORITIES).optional(),
  type: queryEnumList(TASK_TYPES).optional(),
  executor: queryEnumList(TASK_EXECUTORS).optional(),
  assignee: queryEnumList(ASSIGNEE_KINDS).optional(),
  dueBefore: dateOnlySchema.optional(),
  q: z.string().trim().max(200).optional(),
  includeClosed: queryBoolean.default(false),
  sort: z.enum(TASK_SORTS).default('priority'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
})
export type ListTasksQuery = z.output<typeof listTasksQuerySchema>
export type ListTasksQueryInput = z.input<typeof listTasksQuerySchema>

export const addChecklistItemsSchema = z.object({
  items: z.array(z.string().trim().min(1).max(500)).min(1).max(50),
})

export const updateChecklistItemSchema = z.object({
  text: z.string().trim().min(1).max(500).optional(),
  done: z.boolean().optional(),
  position: z.number().finite().optional(),
})

export const linkTasksSchema = z.object({
  /** The task that blocks the current one. */
  blockedBy: taskRefSchema,
})

export const commentBodySchema = z.object({
  body: z.string().trim().min(1).max(20_000),
})
