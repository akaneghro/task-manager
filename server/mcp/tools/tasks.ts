// Task tools: list_tasks, get_task, search_tasks, create_task, update_task, set_status.

import { z } from 'zod'
import {
  ASSIGNEE_KINDS,
  TASK_EXECUTORS,
  TASK_PRIORITIES,
  TASK_SIZES,
  TASK_STATUSES,
  TASK_TYPES,
} from '../../../shared/utils/enums'
import { dateOnlySchema } from '../../../shared/schemas/common'
import { TASK_SORTS, listTasksQuerySchema } from '../../../shared/schemas/task'
import type { AssigneeInput, TaskPatch } from '../../../shared/schemas/task'
import { createTask, getTask, listTasks, parseServiceInput, searchTasks, setTaskStatus, updateTask } from '../../services/tasks'
import { jsonResult, runTool } from '../result'
import {
  IDEMPOTENT_WRITE,
  READ_ONLY,
  WRITE,
  defaultProjectOf,
  expectedVersionParam,
  projectParam,
  taskRefParam,
  taskUrl,
} from './common'
import type { ToolRegistrar } from './common'
import { compactTaskDetail, compactTaskRow } from './format'

export const LIST_DEFAULT_LIMIT = 50
export const LIST_MAX_LIMIT = 200
const SEARCH_MAX_LIMIT = 50

const assigneeParam = z.union([
  z.enum(['none', 'owner', 'claude']),
  z.object({ external: z.string().trim().min(1).max(120) }).strict(),
]).describe('"none", "owner" (the user), "claude", or {"external": "<name>"} for a third party.')

export type McpAssignee = z.infer<typeof assigneeParam>

export function toAssigneeInput(assignee: McpAssignee): AssigneeInput {
  return typeof assignee === 'string' ? { kind: assignee } : { kind: 'external', name: assignee.external }
}

const blockerParam = z.object({
  who: z.string().trim().min(1).max(120).describe('Who we are waiting for (client, provider...).'),
  what: z.string().trim().min(1).max(500).describe('What we are waiting for.'),
  since: dateOnlySchema.optional().describe('YYYY-MM-DD, default today.'),
})

const statusParam = z.enum(TASK_STATUSES)
const dueParam = dateOnlySchema.describe('Due date YYYY-MM-DD.')

export const registerTaskTools: ToolRegistrar = (server, ctx) => {
  server.registerTool('list_tasks', {
    title: 'List tasks',
    description: 'Lists tasks as compact rows (key, title, status, priority, type, size, executor, due, version, '
      + 'checklist "done/total", blockedBy keys). Defaults to the session project; pass project "all" for every '
      + 'project. Closed tasks (done/cancelled) are hidden unless includeClosed or a status filter is given.',
    inputSchema: z.object({
      project: projectParam.optional().describe('Project slug, or "all". Default: the session project (or all when none).'),
      status: z.array(statusParam).optional(),
      priority: z.array(z.enum(TASK_PRIORITIES)).optional(),
      type: z.array(z.enum(TASK_TYPES)).optional(),
      executor: z.array(z.enum(TASK_EXECUTORS)).optional(),
      assignee: z.array(z.enum(ASSIGNEE_KINDS)).optional().describe('Assignee kinds.'),
      dueBefore: dateOnlySchema.optional().describe('Only tasks due on or before this date (YYYY-MM-DD).'),
      includeClosed: z.boolean().optional(),
      sort: z.enum(TASK_SORTS).optional().describe('Default "priority" (then due date).'),
      limit: z.number().int().min(1).max(LIST_MAX_LIMIT).optional().describe(`Default ${LIST_DEFAULT_LIMIT}, max ${LIST_MAX_LIMIT}.`),
      offset: z.number().int().min(0).optional(),
    }),
    annotations: READ_ONLY,
  }, args => runTool(async () => {
    const project = args.project ?? defaultProjectOf(ctx) ?? 'all'
    const limit = args.limit ?? LIST_DEFAULT_LIMIT
    const offset = args.offset ?? 0
    const query = parseServiceInput(listTasksQuerySchema, {
      project,
      status: args.status,
      priority: args.priority,
      type: args.type,
      executor: args.executor,
      assignee: args.assignee,
      dueBefore: args.dueBefore,
      includeClosed: args.includeClosed ?? false,
      sort: args.sort ?? 'priority',
      limit,
      offset,
    })
    const list = await listTasks(ctx, query)
    return jsonResult({
      project,
      total: list.total,
      offset: offset > 0 ? offset : undefined,
      more: offset + list.items.length < list.total ? true : undefined,
      tasks: list.items.map(compactTaskRow),
    }, { structured: true })
  }))

  server.registerTool('get_task', {
    title: 'Get task',
    description: 'Returns a task with description, checklist (with 1-based index and id for toggle_checklist_item), '
      + 'dependencies, third-party blocker, latest comments and "version" (pass it as expectedVersion when updating).',
    inputSchema: z.object({ ref: taskRefParam }),
    annotations: READ_ONLY,
  }, ({ ref }) => runTool(async () => {
    const task = await getTask(ctx, ref)
    return jsonResult(compactTaskDetail(task), { structured: true })
  }))

  server.registerTool('search_tasks', {
    title: 'Search tasks',
    description: 'Free-text search over task titles, descriptions and keys, most recently updated first. Use it before '
      + 'creating a task to avoid duplicates. Searches the session project by default; pass project "all" to search everywhere.',
    inputSchema: z.object({
      query: z.string().trim().min(1).max(200).describe('Words to look for, or a task key.'),
      project: projectParam.optional().describe('Project slug or "all". Default: the session project (or all when none).'),
      includeClosed: z.boolean().optional().describe('Also search done/cancelled tasks (default false).'),
      limit: z.number().int().min(1).max(SEARCH_MAX_LIMIT).optional().describe('Default 20.'),
    }),
    annotations: READ_ONLY,
  }, ({ query, project, includeClosed, limit }) => runTool(async () => {
    const items = await searchTasks(ctx, {
      query,
      project: project ?? defaultProjectOf(ctx) ?? 'all',
      includeClosed,
      limit,
    })
    return jsonResult({ tasks: items.map(compactTaskRow) })
  }))

  server.registerTool('create_task', {
    title: 'Create task',
    description: 'Creates a task in the session project (or "project"). Search first to avoid duplicates. Set type and '
      + 'size, executor "ai" for work you will do yourself, and a checklist for multi-step work. Do not set priority, '
      + 'dueDate or assignee unless the user asked. Returns the new key, version and URL.',
    inputSchema: z.object({
      project: projectParam.optional().describe('Project slug. Default: the session project, else the Inbox.'),
      title: z.string().trim().min(1).max(200).describe('Short imperative title.'),
      description: z.string().max(100_000).optional().describe('Markdown: context, acceptance criteria.'),
      status: statusParam.optional().describe('Default "todo". Use "backlog" for not-yet-planned work.'),
      priority: z.enum(TASK_PRIORITIES).optional().describe('Default "medium".'),
      type: z.enum(TASK_TYPES).optional().describe('Default "feature". Use "idea" for ideas.'),
      size: z.enum(TASK_SIZES).optional().describe('Effort estimate XS..XL.'),
      executor: z.enum(TASK_EXECUTORS).optional().describe('Who does the work: "ai" (default), "human" or "mixed".'),
      assignee: assigneeParam.optional(),
      dueDate: dueParam.optional(),
      checklist: z.array(z.string().trim().min(1).max(500)).max(50).optional().describe('Checklist items, in order.'),
      blockedBy: z.array(taskRefParam).max(20).optional().describe('Keys of tasks that must be finished first.'),
    }),
    annotations: WRITE,
  }, ({ assignee, ...input }) => runTool(async () => {
    const task = await createTask(ctx, {
      ...input,
      assignee: assignee === undefined ? undefined : toAssigneeInput(assignee),
    })
    return jsonResult({
      key: task.key,
      version: task.version,
      project: task.projectSlug,
      status: task.status,
      url: taskUrl(ctx, task.key),
    }, { structured: true })
  }))

  server.registerTool('update_task', {
    title: 'Update task',
    description: 'Changes task fields. Requires expectedVersion from your last read; if someone (usually the user) '
      + 'changed the task meanwhile you get a conflict error with the current state: merge and retry, never blindly '
      + 'overwrite. Only send the fields you change. Do not change priority, dueDate or assignee unless the user asked. '
      + 'For status-only changes prefer set_status.',
    inputSchema: z.object({
      ref: taskRefParam,
      expectedVersion: expectedVersionParam,
      patch: z.object({
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().max(100_000).optional().describe('Full new markdown description (replaces the old one).'),
        status: statusParam.optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        type: z.enum(TASK_TYPES).optional(),
        size: z.enum(TASK_SIZES).nullable().optional().describe('null clears it.'),
        executor: z.enum(TASK_EXECUTORS).optional(),
        assignee: assigneeParam.optional(),
        dueDate: dueParam.nullable().optional().describe('YYYY-MM-DD, null clears it.'),
        blocker: blockerParam.nullable().optional().describe('Third-party blocker; null clears it.'),
      }).describe('Fields to change.'),
    }),
    annotations: WRITE,
  }, ({ ref, expectedVersion, patch }) => runTool(async () => {
    const { assignee, ...rest } = patch
    const servicePatch: TaskPatch = { ...rest }
    if (assignee !== undefined) servicePatch.assignee = toAssigneeInput(assignee)
    const task = await updateTask(ctx, ref, { expectedVersion, patch: servicePatch })
    return jsonResult(compactTaskRow(task), { structured: true })
  }))

  server.registerTool('set_status', {
    title: 'Set task status',
    description: 'Moves a task to another status: "in_progress" when you start, "in_review" when done and the user '
      + 'should check, "done" when finished, "blocked" + blocker when waiting on a third party. "note" is stored as a '
      + 'comment. With expectedVersion the change is rejected if the task changed; without it only the status is '
      + 'written (safe, never touches other fields). Setting the current status again is a no-op.',
    inputSchema: z.object({
      ref: taskRefParam,
      status: statusParam,
      expectedVersion: expectedVersionParam.optional(),
      note: z.string().trim().min(1).max(10_000).optional().describe('Optional comment explaining the change.'),
      blocker: blockerParam.nullable().optional().describe('Third-party blocker (for "blocked"); null clears it.'),
    }),
    annotations: IDEMPOTENT_WRITE,
  }, ({ ref, ...input }) => runTool(async () => {
    const task = await setTaskStatus(ctx, ref, input)
    return jsonResult(compactTaskRow(task), { structured: true })
  }))
}
