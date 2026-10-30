import { describe, expect, it } from 'vitest'
import {
  applyOptimisticMove,
  groupTasksByStatus,
  isSameSpot,
  isTaskStatus,
  moveTaskToIndex,
  neighborsForDropIndex,
  neighborsOfItem,
  sameProjectNeighborsOfItem,
} from '../kanban'
import type { KanbanItem } from '../kanban'

const t = (id: string, status: KanbanItem['status'], position: number): KanbanItem => ({ id, status, position })

const tasks: KanbanItem[] = [
  t('a', 'todo', 2048),
  t('b', 'todo', 1024),
  t('c', 'todo', 3072),
  t('d', 'done', 1024),
  t('e', 'in_progress', 1024),
]

describe('kanban helpers', () => {
  it('groups by status sorted by position', () => {
    const columns = groupTasksByStatus(tasks)
    expect(columns.todo.map(x => x.id)).toEqual(['b', 'a', 'c'])
    expect(columns.done.map(x => x.id)).toEqual(['d'])
    expect(columns.backlog).toEqual([])
    expect(Object.keys(columns)).toEqual(['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled'])
  })

  it('computes neighbours from a drop index (clamped)', () => {
    const column = [t('x', 'todo', 1), t('y', 'todo', 2), t('z', 'todo', 3)]
    expect(neighborsForDropIndex(column, 0)).toEqual({ beforeId: null, afterId: 'x' })
    expect(neighborsForDropIndex(column, 1)).toEqual({ beforeId: 'x', afterId: 'y' })
    expect(neighborsForDropIndex(column, 3)).toEqual({ beforeId: 'z', afterId: null })
    expect(neighborsForDropIndex(column, 99)).toEqual({ beforeId: 'z', afterId: null })
    expect(neighborsForDropIndex(column, -4)).toEqual({ beforeId: null, afterId: 'x' })
    expect(neighborsForDropIndex([], 0)).toEqual({ beforeId: null, afterId: null })
  })

  it('computes neighbours of an item already placed', () => {
    const column = [t('x', 'todo', 1), t('m', 'todo', 9), t('y', 'todo', 2)]
    expect(neighborsOfItem(column, 'm')).toEqual({ beforeId: 'x', afterId: 'y' })
    expect(neighborsOfItem(column, 'x')).toEqual({ beforeId: null, afterId: 'm' })
    expect(neighborsOfItem(column, 'missing')).toEqual({ beforeId: null, afterId: null })
  })

  it('applies an optimistic move between two neighbours', () => {
    const moved = applyOptimisticMove(tasks, 'd', 'todo', { beforeId: 'b', afterId: 'a' })
    expect(moved.find(x => x.id === 'd')).toEqual({ id: 'd', status: 'todo', position: 1536 })
    expect(groupTasksByStatus(moved).todo.map(x => x.id)).toEqual(['b', 'd', 'a', 'c'])
    // the input is not mutated
    expect(tasks.find(x => x.id === 'd')?.status).toBe('done')
  })

  it('moves to the top, the bottom and into an empty column', () => {
    expect(applyOptimisticMove(tasks, 'c', 'todo', { beforeId: null, afterId: 'b' }).find(x => x.id === 'c')?.position).toBe(0)
    expect(applyOptimisticMove(tasks, 'b', 'todo', { beforeId: 'c', afterId: null }).find(x => x.id === 'b')?.position).toBe(4096)
    expect(applyOptimisticMove(tasks, 'a', 'blocked', { beforeId: null, afterId: null }).find(x => x.id === 'a')).toEqual({ id: 'a', status: 'blocked', position: 1024 })
  })

  it('leaves the list unchanged for unknown ids', () => {
    expect(applyOptimisticMove(tasks, 'zzz', 'todo', { beforeId: null, afterId: null })).toEqual(tasks)
  })

  it('moves to an index within the same column', () => {
    // move b (first) to the end of todo: column without b = [a, c] -> index 2 -> after c
    const { tasks: next, neighbors } = moveTaskToIndex(tasks, 'b', 'todo', 2)
    expect(neighbors).toEqual({ beforeId: 'c', afterId: null })
    expect(groupTasksByStatus(next).todo.map(x => x.id)).toEqual(['a', 'c', 'b'])
  })

  it('moves to an index of another column', () => {
    const { tasks: next, neighbors } = moveTaskToIndex(tasks, 'e', 'todo', 1)
    expect(neighbors).toEqual({ beforeId: 'b', afterId: 'a' })
    const columns = groupTasksByStatus(next)
    expect(columns.todo.map(x => x.id)).toEqual(['b', 'e', 'a', 'c'])
    expect(columns.in_progress).toEqual([])
  })

  it('detects no-op drops and validates statuses', () => {
    expect(isSameSpot('todo', 'todo', 1, 1)).toBe(true)
    expect(isSameSpot('todo', 'done', 1, 1)).toBe(false)
    expect(isTaskStatus('in_review')).toBe(true)
    expect(isTaskStatus('nope')).toBe(false)
    expect(isTaskStatus(undefined)).toBe(false)
  })
})

describe('sameProjectNeighborsOfItem', () => {
  it('skips cards of other projects (global board)', () => {
    const column = [
      { id: 'r1', projectId: 'acm' },
      { id: 'w1', projectId: 'web' },
      { id: 'm', projectId: 'acm' },
      { id: 'w2', projectId: 'web' },
      { id: 'r2', projectId: 'acm' },
    ]
    expect(sameProjectNeighborsOfItem(column, 'm')).toEqual({ beforeId: 'r1', afterId: 'r2' })
    expect(sameProjectNeighborsOfItem(column.slice(1, 4), 'm')).toEqual({ beforeId: null, afterId: null })
    expect(sameProjectNeighborsOfItem(column, 'missing')).toEqual({ beforeId: null, afterId: null })
  })

  it('matches neighborsOfItem on a single-project column', () => {
    const column = [{ id: 'a', projectId: 'p' }, { id: 'm', projectId: 'p' }, { id: 'b', projectId: 'p' }]
    expect(sameProjectNeighborsOfItem(column, 'm')).toEqual(neighborsOfItem(column, 'm'))
  })
})
