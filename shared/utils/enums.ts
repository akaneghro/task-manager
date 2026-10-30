// Single source of truth for every enum used by the DB, the REST API, the MCP server and the UI.

export const TASK_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

/** Statuses that count as "closed" (hidden by default in lists). */
export const CLOSED_TASK_STATUSES: readonly TaskStatus[] = ['done', 'cancelled']

export const TASK_PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

/** Lower rank = more important. Used for sorting. */
export const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

export const TASK_TYPES = ['feature', 'bug', 'test', 'idea', 'maintenance', 'docs'] as const
export type TaskType = (typeof TASK_TYPES)[number]

export const TASK_SIZES = ['XS', 'S', 'M', 'L', 'XL'] as const
export type TaskSize = (typeof TASK_SIZES)[number]

export const TASK_EXECUTORS = ['ai', 'human', 'mixed'] as const
export type TaskExecutor = (typeof TASK_EXECUTORS)[number]

export const ASSIGNEE_KINDS = ['none', 'owner', 'claude', 'member', 'external'] as const
export type AssigneeKind = (typeof ASSIGNEE_KINDS)[number]

export const TASK_LINK_TYPES = ['blocks', 'relates'] as const
export type TaskLinkType = (typeof TASK_LINK_TYPES)[number]

export const PROJECT_STATUSES = ['idea', 'development', 'production', 'maintenance', 'paused', 'archived'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const PROJECT_LINK_KINDS = ['repo', 'prod', 'staging', 'docs', 'other'] as const
export type ProjectLinkKind = (typeof PROJECT_LINK_KINDS)[number]

export const USER_ROLES = ['owner', 'member'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const MEMBER_ROLES = ['viewer', 'commenter'] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]

/** Special project that always exists and cannot be deleted or archived. */
export const INBOX_PROJECT = { slug: 'inbox', key: 'INBOX', name: 'Inbox' } as const
