// Pure display helpers for tasks: i18n label keys, badge colour classes (light + dark), flags.
// Exported names are prefixed/specific to avoid clashing with other auto-imported utils.

import type {
  AssigneeKind,
  TaskExecutor,
  TaskPriority,
  TaskSize,
  TaskStatus,
  TaskType,
} from '#shared/utils/enums'
import type { AssigneeDto, TaskDetailDto, TaskSummaryDto } from '#shared/types/dto'

export const TASK_STATUS_CLASSES: Record<TaskStatus, string> = {
  backlog: 'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700',
  todo: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:ring-sky-800',
  in_progress: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-800',
  in_review: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:ring-violet-800',
  blocked: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-800',
  done: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800',
  cancelled: 'bg-gray-50 text-gray-500 ring-gray-200 dark:bg-gray-900 dark:text-gray-500 dark:ring-gray-800',
}

export const TASK_STATUS_DOT_CLASSES: Record<TaskStatus, string> = {
  backlog: 'bg-gray-400 dark:bg-gray-500',
  todo: 'bg-sky-500 dark:bg-sky-400',
  in_progress: 'bg-amber-500 dark:bg-amber-400',
  in_review: 'bg-violet-500 dark:bg-violet-400',
  blocked: 'bg-red-500 dark:bg-red-400',
  done: 'bg-emerald-500 dark:bg-emerald-400',
  cancelled: 'bg-gray-300 dark:bg-gray-600',
}

export const TASK_PRIORITY_CLASSES: Record<TaskPriority, string> = {
  urgent: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-800',
  high: 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:ring-orange-800',
  medium: 'bg-yellow-50 text-yellow-800 ring-yellow-200 dark:bg-yellow-950/50 dark:text-yellow-300 dark:ring-yellow-800',
  low: 'bg-gray-50 text-gray-600 ring-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:ring-gray-700',
}

export const TASK_PRIORITY_ICON_CLASSES: Record<TaskPriority, string> = {
  urgent: 'text-red-600 dark:text-red-400',
  high: 'text-orange-500 dark:text-orange-400',
  medium: 'text-yellow-500 dark:text-yellow-400',
  low: 'text-gray-400 dark:text-gray-500',
}

export const TASK_TYPE_CLASSES: Record<TaskType, string> = {
  feature: 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:ring-indigo-800',
  bug: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-800',
  test: 'bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:ring-teal-800',
  idea: 'bg-lime-50 text-lime-800 ring-lime-200 dark:bg-lime-950/50 dark:text-lime-300 dark:ring-lime-800',
  maintenance: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  docs: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200 dark:bg-fuchsia-950/60 dark:text-fuchsia-300 dark:ring-fuchsia-800',
}

export const TASK_SIZE_CLASSES = 'bg-white text-gray-700 ring-gray-300 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-600'

export const TASK_EXECUTOR_ICONS: Record<TaskExecutor, readonly ('robot' | 'person')[]> = {
  ai: ['robot'],
  human: ['person'],
  mixed: ['robot', 'person'],
}

export function taskStatusLabelKey(status: TaskStatus): string {
  return `tasks.status.${status}`
}

export function taskPriorityLabelKey(priority: TaskPriority): string {
  return `tasks.priority.${priority}`
}

export function taskTypeLabelKey(type: TaskType): string {
  return `tasks.type.${type}`
}

export function taskSizeLabelKey(size: TaskSize | null): string {
  return size ? `tasks.size.${size}` : 'tasks.size.none'
}

export function taskExecutorLabelKey(executor: TaskExecutor): string {
  return `tasks.executor.${executor}`
}

export function taskAssigneeLabelKey(kind: AssigneeKind): string {
  return `tasks.assignee.${kind}`
}

export function taskStatusClass(status: TaskStatus): string {
  return TASK_STATUS_CLASSES[status]
}

export function taskPriorityClass(priority: TaskPriority): string {
  return TASK_PRIORITY_CLASSES[priority]
}

export function taskTypeClass(type: TaskType): string {
  return TASK_TYPE_CLASSES[type]
}

const CLOSED: ReadonlySet<TaskStatus> = new Set<TaskStatus>(['done', 'cancelled'])

export function isTaskClosed(status: TaskStatus): boolean {
  return CLOSED.has(status)
}

/** Due date strictly before `today` (`YYYY-MM-DD`) and the task still open. */
export function isTaskOverdue(task: Pick<TaskSummaryDto, 'dueDate' | 'status'>, today: string): boolean {
  if (!task.dueDate || isTaskClosed(task.status)) return false
  return task.dueDate < today
}

/** Blocked by status, by open dependencies or by a third party. */
export function isTaskBlocked(task: Pick<TaskSummaryDto, 'status' | 'blockedByKeys' | 'blocker'>): boolean {
  return task.status === 'blocked' || task.blockedByKeys.length > 0 || task.blocker !== null
}

/** `3/5`, or null when the task has no checklist. */
export function checklistProgressLabel(task: Pick<TaskSummaryDto, 'checklistDone' | 'checklistTotal'>): string | null {
  return task.checklistTotal > 0 ? `${task.checklistDone}/${task.checklistTotal}` : null
}

export interface SourceDisplay {
  kind: 'user' | 'mcp' | 'unknown'
  /** Token name for `mcp:`, user id for `user:`, raw value otherwise. */
  name: string
}

/** Parses `user:<id>` / `mcp:<tokenName>` audit sources. */
export function parseTaskSource(source: string | null | undefined): SourceDisplay {
  if (!source) return { kind: 'unknown', name: '' }
  if (source.startsWith('mcp:')) return { kind: 'mcp', name: source.slice(4) }
  if (source.startsWith('user:')) return { kind: 'user', name: source.slice(5) }
  return { kind: 'unknown', name: source }
}

/** Human readable assignee (without i18n for owner/claude/none: returns null so the caller uses the label key). */
export function assigneeDisplayName(assignee: AssigneeDto): string | null {
  if (assignee.kind === 'member' || assignee.kind === 'external') return assignee.name
  return null
}

const SUMMARY_ONLY_KEYS: ReadonlySet<string> = new Set(['description', 'checklist', 'blockedBy', 'blocking', 'hiddenDependencies', 'comments', 'capabilities'])

/** Drops the detail-only fields so a detail can be stored in a list of summaries. */
export function toTaskSummary(task: TaskDetailDto | TaskSummaryDto): TaskSummaryDto {
  const entries = Object.entries(task).filter(([key]) => !SUMMARY_ONLY_KEYS.has(key))
  return Object.fromEntries(entries) as unknown as TaskSummaryDto
}

/** Recomputes the summary counters of a detail after local checklist / comments / links changes. */
export function withDerivedCounters(task: TaskDetailDto): TaskDetailDto {
  return {
    ...task,
    checklistDone: task.checklist.filter(item => item.done).length,
    checklistTotal: task.checklist.length,
    commentCount: task.comments.length,
    blockedByKeys: task.blockedBy.filter(link => !isTaskClosed(link.status)).map(link => link.key),
  }
}
