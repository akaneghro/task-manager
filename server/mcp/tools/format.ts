// Compact, token-friendly views of the service DTOs for MCP tool results.
// Nulls/empty values are dropped so Claude only reads what is set.

import type {
  AssigneeDto,
  BlockerDto,
  ChecklistItemDto,
  CommentDto,
  ProjectDetailDto,
  ProjectSummaryDto,
  TaskCountsByStatus,
  TaskDetailDto,
  TaskLinkRefDto,
  TaskSummaryDto,
} from '../../../shared/types/dto'
import type { ProjectContextDto } from '../../services/tasks'

/** Comments shown by `get_task` (most recent last). */
export const TASK_COMMENTS_SHOWN = 20
const DESCRIPTION_PREVIEW = 160
/** Project notes included in `get_context` (the start of the notes; get_project returns them all). */
export const CONTEXT_NOTES_PREVIEW = 3000

export type CompactAssignee = string | { member: string | null } | { external: string | null }

export function compactAssignee(assignee: AssigneeDto): CompactAssignee | undefined {
  switch (assignee.kind) {
    case 'none':
      return undefined
    case 'member':
      return { member: assignee.name }
    case 'external':
      return { external: assignee.name }
    default:
      return assignee.kind
  }
}

export function compactBlocker(blocker: BlockerDto | null): BlockerDto | undefined {
  return blocker ?? undefined
}

/** Only the statuses with tasks. */
export function compactCounts(counts: TaskCountsByStatus): Partial<TaskCountsByStatus> {
  return Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0))
}

/** One task row of a listing. */
export function compactTaskRow(task: TaskSummaryDto) {
  return {
    key: task.key,
    title: task.title,
    status: task.status,
    priority: task.priority,
    type: task.type,
    size: task.size ?? undefined,
    executor: task.executor,
    assignee: compactAssignee(task.assignee),
    due: task.dueDate ?? undefined,
    blocker: compactBlocker(task.blocker),
    version: task.version,
    checklist: task.checklistTotal > 0 ? `${task.checklistDone}/${task.checklistTotal}` : undefined,
    blockedBy: task.blockedByKeys.length > 0 ? task.blockedByKeys : undefined,
  }
}

function compactLink(link: TaskLinkRefDto) {
  return { key: link.key, title: link.title, status: link.status }
}

export function compactChecklist(items: readonly ChecklistItemDto[]) {
  return items.map((item, i) => ({ index: i + 1, id: item.id, text: item.text, done: item.done }))
}

export function compactComment(comment: CommentDto) {
  return {
    // Claude's comments show the token source (`mcp:<token>`), the user's ones the GitHub login.
    by: comment.author.isClaude ? comment.authorSource : (comment.author.login ?? comment.authorSource),
    at: comment.createdAt,
    body: comment.body,
  }
}

/** Full task view for `get_task` and conflict errors. */
export function compactTaskDetail(task: TaskDetailDto) {
  const comments = task.comments.slice(-TASK_COMMENTS_SHOWN)
  return {
    key: task.key,
    id: task.id,
    project: task.projectSlug,
    title: task.title,
    status: task.status,
    priority: task.priority,
    type: task.type,
    size: task.size ?? undefined,
    executor: task.executor,
    assignee: compactAssignee(task.assignee),
    due: task.dueDate ?? undefined,
    blocker: compactBlocker(task.blocker),
    version: task.version,
    description: task.description || undefined,
    checklist: task.checklist.length > 0 ? compactChecklist(task.checklist) : undefined,
    blockedBy: task.blockedBy.length > 0 ? task.blockedBy.map(compactLink) : undefined,
    blocking: task.blocking.length > 0 ? task.blocking.map(compactLink) : undefined,
    hiddenDependencies: task.hiddenDependencies > 0 ? task.hiddenDependencies : undefined,
    comments: comments.length > 0 ? comments.map(compactComment) : undefined,
    olderComments: task.commentCount > comments.length ? task.commentCount - comments.length : undefined,
    olderCommentsHint: task.commentCount > comments.length ? 'get_task with comments "all" returns them' : undefined,
    createdAt: task.createdAt,
    createdBy: task.createdBy,
    updatedAt: task.updatedAt,
    updatedBy: task.updatedBy,
    completedAt: task.completedAt ?? undefined,
  }
}

function preview(text: string): string | undefined {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (!flat) return undefined
  return flat.length > DESCRIPTION_PREVIEW ? `${flat.slice(0, DESCRIPTION_PREVIEW - 1)}…` : flat
}

export function compactProjectSummary(project: ProjectSummaryDto) {
  return {
    slug: project.slug,
    key: project.key,
    name: project.name,
    status: project.status,
    inbox: project.isInbox || undefined,
    client: project.client ?? undefined,
    description: preview(project.description),
    openTasks: project.openCount,
  }
}

export function compactProjectDetail(project: ProjectDetailDto) {
  return {
    slug: project.slug,
    key: project.key,
    name: project.name,
    status: project.status,
    inbox: project.isInbox || undefined,
    client: project.client ?? undefined,
    description: project.description || undefined,
    links: project.links.length > 0 ? project.links.map(l => ({ kind: l.kind, label: l.label, url: l.url })) : undefined,
    notes: project.notes || undefined,
    counts: compactCounts(project.counts),
    openTasks: project.openCount,
    version: project.version,
    updatedAt: project.updatedAt,
    updatedBy: project.updatedBy,
  }
}

export function compactProjectContext(context: ProjectContextDto) {
  const p = context.project
  return {
    project: {
      slug: p.slug,
      key: p.key,
      name: p.name,
      status: p.status,
      inbox: p.isInbox || undefined,
      description: p.description || undefined,
      counts: compactCounts(p.counts),
      openTasks: p.openCount,
      links: p.links.length > 0 ? p.links.map(l => ({ kind: l.kind, label: l.label, url: l.url })) : undefined,
      // Durable knowledge recorded by earlier sessions (update_project_notes): read it before working.
      notes: p.notes ? p.notes.slice(0, CONTEXT_NOTES_PREVIEW) : undefined,
      notesTruncated: p.notes.length > CONTEXT_NOTES_PREVIEW ? true : undefined,
      notesLength: p.notes.length > CONTEXT_NOTES_PREVIEW ? p.notes.length : undefined,
    },
    inProgress: context.inProgress.map(compactTaskRow),
    nextUp: context.nextUp.map(compactTaskRow),
    blocked: context.blocked.map(compactTaskRow),
    inReview: context.inReview.map(compactTaskRow),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isTaskDetail(value: unknown): value is TaskDetailDto {
  return isRecord(value) && typeof value.key === 'string' && Array.isArray(value.checklist) && Array.isArray(value.comments)
}

export function isProjectDetail(value: unknown): value is ProjectDetailDto {
  return isRecord(value) && typeof value.slug === 'string' && typeof value.notes === 'string' && Array.isArray(value.links)
}
