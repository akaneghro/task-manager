// Every task write of the UI goes through here: optimistic scalar edits with 409 handling,
// kanban moves, creation, checklist, dependencies and comments.

import type { Ref } from 'vue'
import type {
  AssigneeDto,
  BlockerDto,
  ChecklistItemDto,
  CommentDto,
  TaskDetailDto,
  TaskSummaryDto,
} from '#shared/types/dto'
import type { TaskStatus } from '#shared/utils/enums'
import type { AssigneeInput, BlockerInput, CreateTaskInput, TaskPatch } from '#shared/schemas/task'
import { useUiStore } from '../stores/ui'

export interface TaskConflict {
  /** The change the user tried to save. */
  patch: TaskPatch
  /** Server state at the time of the conflict. */
  current: TaskDetailDto
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Reads the current task out of a 409 error (`data.details`, or `details.current` for `ConflictDto`). */
export function conflictCurrentTask(err: unknown): TaskDetailDto | null {
  const details = getErrorDetails(err)
  const candidate = isRecord(details) && isRecord(details.current) ? details.current : details
  if (isRecord(candidate) && typeof candidate.id === 'string' && typeof candidate.version === 'number' && typeof candidate.key === 'string') {
    return candidate as unknown as TaskDetailDto
  }
  return null
}

export function assigneeInputToDto(input: AssigneeInput): AssigneeDto {
  switch (input.kind) {
    case 'member':
      return { kind: 'member', userId: input.userId, name: null }
    case 'external':
      return { kind: 'external', userId: null, name: input.name }
    default:
      return { kind: input.kind, userId: null, name: null }
  }
}

export function blockerInputToDto(input: BlockerInput | null): BlockerDto | null {
  return input ? { who: input.who, what: input.what, since: input.since ?? null } : null
}

/** Applies a patch locally (optimistic UI) using the same shapes the server returns. */
export function applyTaskPatchLocally<T extends TaskSummaryDto>(task: T, patch: TaskPatch): T {
  const next: T = { ...task }
  if (patch.title !== undefined) next.title = patch.title.trim()
  if (patch.status !== undefined) next.status = patch.status
  if (patch.priority !== undefined) next.priority = patch.priority
  if (patch.type !== undefined) next.type = patch.type
  if (patch.size !== undefined) next.size = patch.size
  if (patch.executor !== undefined) next.executor = patch.executor
  if (patch.assignee !== undefined) next.assignee = assigneeInputToDto(patch.assignee)
  if (patch.dueDate !== undefined) next.dueDate = patch.dueDate
  if (patch.blocker !== undefined) next.blocker = blockerInputToDto(patch.blocker)
  if (patch.description !== undefined && 'description' in next) {
    (next as T & { description: string }).description = patch.description
  }
  return next
}

function taskUrl(ref: string): string {
  return `/api/tasks/${encodeURIComponent(ref)}`
}

export function useTaskMutations() {
  const ui = useUiStore()
  const toast = useToast()
  const apiError = useApiError()

  const conflict = ref<TaskConflict | null>(null)
  const saving = ref(false)

  function reportError(err: unknown) {
    toast.error(apiError.message(err))
  }

  /**
   * PATCH with optimistic UI on `target`. On 409 the previous value is restored and `conflict` is set.
   * Returns the saved task or null when it failed.
   */
  async function patchTask(target: Ref<TaskDetailDto | null>, patch: TaskPatch, expectedVersion?: number): Promise<TaskDetailDto | null> {
    const previous = target.value
    if (!previous) return null
    const version = expectedVersion ?? previous.version
    target.value = applyTaskPatchLocally(previous, patch)
    saving.value = true
    try {
      const saved = await ui.track(() => apiFetch<TaskDetailDto>(taskUrl(previous.id), {
        method: 'PATCH',
        body: { expectedVersion: version, patch },
      }))
      // The server returns the full detail (checklist, links and comments included).
      target.value = saved
      conflict.value = null
      return saved
    }
    catch (err) {
      target.value = previous
      const current = isConflictError(err) ? conflictCurrentTask(err) : null
      if (current) conflict.value = { patch, current }
      else reportError(err)
      return null
    }
    finally {
      saving.value = false
    }
  }

  /** Conflict resolution "Use theirs": show the server state and drop my change. */
  function acceptTheirs(target: Ref<TaskDetailDto | null>) {
    if (!conflict.value) return
    target.value = conflict.value.current
    conflict.value = null
  }

  /** Conflict resolution "Overwrite mine": retry my change against the current version. */
  async function overwriteMine(target: Ref<TaskDetailDto | null>): Promise<TaskDetailDto | null> {
    const pending = conflict.value
    if (!pending) return null
    conflict.value = null
    target.value = pending.current
    return patchTask(target, pending.patch, pending.current.version)
  }

  function dismissConflict() {
    conflict.value = null
  }

  /** Kanban move. Throws so the caller can roll back. */
  function moveTask(task: Pick<TaskSummaryDto, 'id' | 'version'>, move: { status: TaskStatus, beforeId: string | null, afterId: string | null }): Promise<TaskSummaryDto> {
    return ui.track(() => apiFetch<TaskSummaryDto>(`${taskUrl(task.id)}/move`, {
      method: 'POST',
      body: { status: move.status, beforeId: move.beforeId, afterId: move.afterId, expectedVersion: task.version },
    }))
  }

  function createTask(input: CreateTaskInput): Promise<TaskDetailDto> {
    return ui.track(() => apiFetch<TaskDetailDto>('/api/tasks', { method: 'POST', body: { ...input } }))
  }

  async function deleteTask(ref: string): Promise<void> {
    await ui.track(() => apiFetch<{ ok: true }>(taskUrl(ref), { method: 'DELETE' }))
  }

  function addChecklistItems(ref: string, items: string[]): Promise<ChecklistItemDto[]> {
    return ui.track(() => apiFetch<ChecklistItemDto[]>(`${taskUrl(ref)}/checklist`, { method: 'POST', body: { items } }))
  }

  function updateChecklistItem(id: string, patch: { text?: string, done?: boolean, position?: number }): Promise<ChecklistItemDto> {
    return ui.track(() => apiFetch<ChecklistItemDto>(`/api/checklist/${encodeURIComponent(id)}`, { method: 'PATCH', body: { ...patch } }))
  }

  async function deleteChecklistItem(id: string): Promise<void> {
    await ui.track(() => apiFetch<{ ok: true }>(`/api/checklist/${encodeURIComponent(id)}`, { method: 'DELETE' }))
  }

  function addBlockedBy(ref: string, blockedBy: string): Promise<TaskDetailDto> {
    return ui.track(() => apiFetch<TaskDetailDto>(`${taskUrl(ref)}/links`, { method: 'POST', body: { blockedBy } }))
  }

  async function removeLink(linkId: string): Promise<void> {
    await ui.track(() => apiFetch<{ ok: true }>(`/api/task-links/${encodeURIComponent(linkId)}`, { method: 'DELETE' }))
  }

  function addComment(ref: string, body: string): Promise<CommentDto> {
    return ui.track(() => apiFetch<CommentDto>(`${taskUrl(ref)}/comments`, { method: 'POST', body: { body } }))
  }

  function updateComment(id: string, body: string): Promise<CommentDto> {
    return ui.track(() => apiFetch<CommentDto>(`/api/comments/${encodeURIComponent(id)}`, { method: 'PATCH', body: { body } }))
  }

  async function deleteComment(id: string): Promise<void> {
    await ui.track(() => apiFetch<{ ok: true }>(`/api/comments/${encodeURIComponent(id)}`, { method: 'DELETE' }))
  }

  return {
    conflict,
    saving,
    reportError,
    patchTask,
    acceptTheirs,
    overwriteMine,
    dismissConflict,
    moveTask,
    createTask,
    deleteTask,
    addChecklistItems,
    updateChecklistItem,
    deleteChecklistItem,
    addBlockedBy,
    removeLink,
    addComment,
    updateComment,
    deleteComment,
  }
}
