// Pure kanban helpers: grouping by status, neighbours of a dropped card and optimistic moves.

import { TASK_STATUSES } from '#shared/utils/enums'
import type { TaskStatus } from '#shared/utils/enums'
import { positionBetween } from '#shared/utils/position'

export interface KanbanItem {
  id: string
  status: TaskStatus
  position: number
}

export type KanbanColumns<T extends KanbanItem> = Record<TaskStatus, T[]>

export interface DropNeighbors {
  /** Task right above the dropped card (null = top of the column). */
  beforeId: string | null
  /** Task right below the dropped card (null = bottom of the column). */
  afterId: string | null
}

/** Stable position sort (ties broken by id so the order is deterministic). */
export function sortByPosition<T extends KanbanItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
}

/** One column per status, each sorted by position. */
export function groupTasksByStatus<T extends KanbanItem>(tasks: readonly T[]): KanbanColumns<T> {
  const columns = Object.fromEntries(TASK_STATUSES.map(status => [status, [] as T[]])) as KanbanColumns<T>
  for (const task of tasks) columns[task.status].push(task)
  for (const status of TASK_STATUSES) columns[status] = sortByPosition(columns[status])
  return columns
}

/**
 * Neighbours for inserting a card at `dropIndex` into `column` (a column that does NOT contain the card).
 * The index is clamped to the column bounds.
 */
export function neighborsForDropIndex<T extends { id: string }>(column: readonly T[], dropIndex: number): DropNeighbors {
  const index = Math.max(0, Math.min(Math.trunc(dropIndex), column.length))
  return {
    beforeId: column[index - 1]?.id ?? null,
    afterId: column[index]?.id ?? null,
  }
}

/** Neighbours of `movedId` inside a column that already contains it at its new place (after the drop). */
export function neighborsOfItem<T extends { id: string }>(column: readonly T[], movedId: string): DropNeighbors {
  const index = column.findIndex(item => item.id === movedId)
  if (index === -1) return { beforeId: null, afterId: null }
  return {
    beforeId: column[index - 1]?.id ?? null,
    afterId: column[index + 1]?.id ?? null,
  }
}

/**
 * Optimistically moves a task: new status and a position between its neighbours (same rule as the server).
 * Returns a new array; unknown ids leave the list unchanged.
 */
export function applyOptimisticMove<T extends KanbanItem>(
  tasks: readonly T[],
  taskId: string,
  status: TaskStatus,
  neighbors: DropNeighbors,
): T[] {
  if (!tasks.some(task => task.id === taskId)) return [...tasks]
  const byId = new Map(tasks.map(task => [task.id, task]))
  const before = neighbors.beforeId ? byId.get(neighbors.beforeId)?.position : undefined
  const after = neighbors.afterId ? byId.get(neighbors.afterId)?.position : undefined
  const position = positionBetween(before, after)
  return tasks.map(task => (task.id === taskId ? { ...task, status, position } : task))
}

/**
 * Moves a task to `dropIndex` of the `status` column and returns the neighbours plus the updated list.
 * `dropIndex` is the index in the target column once the card has been removed from its old place.
 */
export function moveTaskToIndex<T extends KanbanItem>(
  tasks: readonly T[],
  taskId: string,
  status: TaskStatus,
  dropIndex: number,
): { tasks: T[], neighbors: DropNeighbors } {
  const column = sortByPosition(tasks.filter(task => task.status === status && task.id !== taskId))
  const neighbors = neighborsForDropIndex(column, dropIndex)
  return { tasks: applyOptimisticMove(tasks, taskId, status, neighbors), neighbors }
}

/** Whether a drag ended where it started (no request needed). */
export function isSameSpot(fromStatus: TaskStatus, toStatus: TaskStatus, oldIndex: number | undefined, newIndex: number | undefined): boolean {
  return fromStatus === toStatus && oldIndex === newIndex
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (TASK_STATUSES as readonly string[]).includes(value)
}
