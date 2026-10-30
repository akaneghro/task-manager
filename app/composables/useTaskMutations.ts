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

  /**
   * Scalar PATCHes are serialized per task: each waits for the previous one and is sent with the version of the
   * latest server-confirmed task, so quick successive edits (priority then status) never conflict with each
   * other. `confirmed` is that latest server state; `queued` the edits not settled yet (re-applied optimistically
   * on top of `confirmed` whenever it changes).
   */
  interface QueuedPatch {
    patch: TaskPatch
    cancelled: boolean
  }
  const queues = new Map<string, Promise<unknown>>()
  const queued = new Map<string, QueuedPatch[]>()
  const confirmed = new Map<string, TaskDetailDto>()

  function pendingPatches(taskId: string): QueuedPatch[] {
    return queued.get(taskId) ?? []
  }

  /** Whether scalar edits of this task are still being saved (callers keep their optimistic copy meanwhile). */
  function isPatching(taskId: string): boolean {
    return pendingPatches(taskId).length > 0
  }

  /** Latest confirmed task with the edits still in flight applied on top (what the user expects to see). */
  function optimisticView(taskId: string): TaskDetailDto | null {
    const base = confirmed.get(taskId)
    if (!base) return null
    return pendingPatches(taskId).filter(q => !q.cancelled).reduce((task, q) => applyTaskPatchLocally(task, q.patch), base)
  }

  function settle(taskId: string, entry: QueuedPatch) {
    const list = pendingPatches(taskId).filter(q => q !== entry)
    if (list.length > 0) queued.set(taskId, list)
    else queued.delete(taskId)
  }

  function reportError(err: unknown) {
    toast.error(apiError.message(err))
  }

  /**
   * PATCH with optimistic UI on `target`, queued behind any edit of the same task still in flight.
   * On failure `target` goes back to the latest server-confirmed task (plus the edits still queued); on 409 the
   * edits queued behind the conflicting one are folded into `conflict.patch` instead of being sent.
   * Returns the saved task or null when it failed.
   */
  function patchTask(target: Ref<TaskDetailDto | null>, patch: TaskPatch, expectedVersion?: number): Promise<TaskDetailDto | null> {
    const initial = target.value
    if (!initial) return Promise.resolve(null)
    const taskId = initial.id
    // Nothing in flight: what is shown is the server state (the optimistic overlay only exists while queued).
    if (!isPatching(taskId)) confirmed.set(taskId, initial)
    const entry: QueuedPatch = { patch, cancelled: false }
    queued.set(taskId, [...pendingPatches(taskId), entry])
    target.value = applyTaskPatchLocally(initial, patch)

    const run = async (): Promise<TaskDetailDto | null> => {
      if (entry.cancelled) {
        settle(taskId, entry)
        return null
      }
      const base = confirmed.get(taskId) ?? initial
      const version = expectedVersion ?? base.version
      saving.value = true
      try {
        const saved = await ui.track(() => apiFetch<TaskDetailDto>(taskUrl(taskId), {
          method: 'PATCH',
          body: { expectedVersion: version, patch },
        }))
        // The server returns the full detail (checklist, links and comments included).
        confirmed.set(taskId, saved)
        settle(taskId, entry)
        if (target.value?.id === taskId) target.value = optimisticView(taskId) ?? saved
        conflict.value = null
        return saved
      }
      catch (err) {
        settle(taskId, entry)
        const current = isConflictError(err) ? conflictCurrentTask(err) : null
        if (current) {
          // Edits queued behind this one were made on the same stale view: they become part of the conflict.
          let merged: TaskPatch = { ...patch }
          for (const later of pendingPatches(taskId)) {
            if (later.cancelled) continue
            later.cancelled = true
            merged = { ...merged, ...later.patch }
          }
          confirmed.set(taskId, current)
          conflict.value = { patch: merged, current }
        }
        else {
          reportError(err)
        }
        if (target.value?.id === taskId) target.value = optimisticView(taskId) ?? confirmed.get(taskId) ?? initial
        return null
      }
      finally {
        saving.value = isPatching(taskId)
        if (!isPatching(taskId)) confirmed.delete(taskId)
      }
    }

    const previousRun = queues.get(taskId) ?? Promise.resolve()
    const result = previousRun.then(run, run)
    const tail = result.catch(() => null)
    queues.set(taskId, tail)
    void tail.then(() => {
      if (queues.get(taskId) === tail) queues.delete(taskId)
    })
    return result
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
    isPatching,
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
