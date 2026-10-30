import { describe, expect, it } from 'vitest'
import { TASK_EXECUTORS, TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES } from '#shared/utils/enums'
import type { TaskDetailDto } from '#shared/types/dto'
import {
  TASK_EXECUTOR_ICONS,
  checklistProgressLabel,
  isTaskBlocked,
  isTaskClosed,
  isTaskOverdue,
  parseTaskSource,
  taskAssigneeLabelKey,
  taskExecutorLabelKey,
  taskPriorityClass,
  taskPriorityLabelKey,
  taskSizeLabelKey,
  taskStatusClass,
  taskStatusLabelKey,
  taskTypeClass,
  taskTypeLabelKey,
  toTaskSummary,
  withDerivedCounters,
} from '../taskDisplay'
import es from '../../../i18n/locales/es/tasks.json'
import en from '../../../i18n/locales/en/tasks.json'

function lookup(messages: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined), messages)
}

function makeTask(overrides: Partial<TaskDetailDto> = {}): TaskDetailDto {
  return {
    id: 't1',
    key: 'ABC-1',
    number: 1,
    projectId: 'p1',
    projectSlug: 'abc',
    projectKey: 'ABC',
    projectName: 'Abc',
    title: 'Task',
    status: 'todo',
    priority: 'medium',
    type: 'feature',
    size: null,
    executor: 'ai',
    assignee: { kind: 'none', userId: null, name: null },
    dueDate: null,
    blocker: null,
    position: 1024,
    version: 1,
    checklistDone: 0,
    checklistTotal: 0,
    blockedByKeys: [],
    commentCount: 0,
    completedAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    createdBy: 'user:u1',
    updatedBy: 'mcp:laptop',
    description: '',
    checklist: [],
    blockedBy: [],
    blocking: [],
    hiddenDependencies: 0,
    comments: [],
    ...overrides,
  }
}

describe('taskDisplay', () => {
  it('builds i18n keys that exist in both locales', () => {
    const keys = [
      ...TASK_STATUSES.map(taskStatusLabelKey),
      ...TASK_PRIORITIES.map(taskPriorityLabelKey),
      ...TASK_TYPES.map(taskTypeLabelKey),
      ...TASK_EXECUTORS.map(taskExecutorLabelKey),
      taskSizeLabelKey('XL'),
      taskSizeLabelKey(null),
      taskAssigneeLabelKey('claude'),
      taskAssigneeLabelKey('none'),
    ]
    expect(taskStatusLabelKey('in_progress')).toBe('tasks.status.in_progress')
    expect(taskSizeLabelKey(null)).toBe('tasks.size.none')
    for (const key of keys) {
      expect(typeof lookup(es, key), `es ${key}`).toBe('string')
      expect(typeof lookup(en, key), `en ${key}`).toBe('string')
    }
  })

  it('gives every enum value light and dark colour classes', () => {
    for (const s of TASK_STATUSES) expect(taskStatusClass(s)).toMatch(/bg-\S+ .*dark:bg-/)
    for (const p of TASK_PRIORITIES) expect(taskPriorityClass(p)).toMatch(/dark:text-/)
    for (const ty of TASK_TYPES) expect(taskTypeClass(ty)).toMatch(/dark:/)
    expect(taskStatusClass('blocked')).toContain('red')
    expect(taskPriorityClass('urgent')).toContain('red')
  })

  it('maps executors to icons', () => {
    expect(TASK_EXECUTOR_ICONS.ai).toEqual(['robot'])
    expect(TASK_EXECUTOR_ICONS.human).toEqual(['person'])
    expect(TASK_EXECUTOR_ICONS.mixed).toEqual(['robot', 'person'])
  })

  it('detects overdue open tasks only', () => {
    expect(isTaskOverdue({ dueDate: '2026-10-29', status: 'todo' }, '2026-10-30')).toBe(true)
    expect(isTaskOverdue({ dueDate: '2026-10-30', status: 'todo' }, '2026-10-30')).toBe(false)
    expect(isTaskOverdue({ dueDate: '2026-10-29', status: 'done' }, '2026-10-30')).toBe(false)
    expect(isTaskOverdue({ dueDate: '2026-10-29', status: 'cancelled' }, '2026-10-30')).toBe(false)
    expect(isTaskOverdue({ dueDate: null, status: 'todo' }, '2026-10-30')).toBe(false)
  })

  it('detects blocked tasks and closed statuses', () => {
    expect(isTaskBlocked({ status: 'todo', blockedByKeys: [], blocker: null })).toBe(false)
    expect(isTaskBlocked({ status: 'blocked', blockedByKeys: [], blocker: null })).toBe(true)
    expect(isTaskBlocked({ status: 'todo', blockedByKeys: ['X-1'], blocker: null })).toBe(true)
    expect(isTaskBlocked({ status: 'todo', blockedByKeys: [], blocker: { who: 'Client', what: 'Logo', since: null } })).toBe(true)
    expect(isTaskClosed('done')).toBe(true)
    expect(isTaskClosed('in_review')).toBe(false)
  })

  it('formats checklist progress', () => {
    expect(checklistProgressLabel({ checklistDone: 2, checklistTotal: 5 })).toBe('2/5')
    expect(checklistProgressLabel({ checklistDone: 0, checklistTotal: 0 })).toBeNull()
  })

  it('parses audit sources', () => {
    expect(parseTaskSource('mcp:laptop')).toEqual({ kind: 'mcp', name: 'laptop' })
    expect(parseTaskSource('user:123')).toEqual({ kind: 'user', name: '123' })
    expect(parseTaskSource('system')).toEqual({ kind: 'unknown', name: 'system' })
    expect(parseTaskSource(null)).toEqual({ kind: 'unknown', name: '' })
  })

  it('strips detail-only fields and recomputes counters', () => {
    const detail = makeTask({
      checklist: [
        { id: 'c1', text: 'a', done: true, position: 1, doneAt: null, doneBy: null },
        { id: 'c2', text: 'b', done: false, position: 2, doneAt: null, doneBy: null },
      ],
      blockedBy: [
        { linkId: 'l1', taskId: 't2', key: 'ABC-2', title: 'x', status: 'todo', projectSlug: 'abc' },
        { linkId: 'l2', taskId: 't3', key: 'ABC-3', title: 'y', status: 'done', projectSlug: 'abc' },
      ],
    })
    const derived = withDerivedCounters(detail)
    expect(derived.checklistDone).toBe(1)
    expect(derived.checklistTotal).toBe(2)
    expect(derived.blockedByKeys).toEqual(['ABC-2'])
    const summary = toTaskSummary(derived)
    expect(summary).not.toHaveProperty('checklist')
    expect(summary).not.toHaveProperty('description')
    expect(summary.key).toBe('ABC-1')
  })
})
