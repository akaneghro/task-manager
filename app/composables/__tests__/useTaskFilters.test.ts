import { describe, expect, it } from 'vitest'
import {
  countActiveTaskFilters,
  emptyTaskFilters,
  mergeTaskFiltersIntoQuery,
  parseTaskFiltersQuery,
  parseTaskView,
  taskFiltersToApiQuery,
  taskFiltersToQuery,
} from '../useTaskFilters'
import type { TaskFilters } from '../useTaskFilters'

describe('useTaskFilters helpers', () => {
  it('parses an empty query to the defaults', () => {
    expect(parseTaskFiltersQuery({})).toEqual(emptyTaskFilters())
  })

  it('round trips filters -> query -> filters', () => {
    const filters: TaskFilters = {
      status: ['todo', 'in_progress'],
      priority: ['urgent'],
      type: ['bug', 'docs'],
      executor: ['ai'],
      assignee: ['claude', 'external'],
      project: 'renkia',
      q: 'login page',
      includeClosed: true,
      sort: 'due',
    }
    const query = taskFiltersToQuery(filters)
    expect(query).toEqual({
      status: 'todo,in_progress',
      priority: 'urgent',
      type: 'bug,docs',
      executor: 'ai',
      assignee: 'claude,external',
      project: 'renkia',
      q: 'login page',
      includeClosed: 'true',
      sort: 'due',
    })
    expect(parseTaskFiltersQuery(query)).toEqual(filters)
  })

  it('omits defaults from the query', () => {
    expect(taskFiltersToQuery(emptyTaskFilters())).toEqual({})
  })

  it('accepts repeated params, drops unknown values and duplicates', () => {
    const filters = parseTaskFiltersQuery({
      status: ['todo', 'nope,done', 'todo'],
      priority: 'high, low ,bogus',
      sort: 'whatever',
      includeClosed: '1',
      project: 'all',
      q: '  hello  ',
    })
    expect(filters.status).toEqual(['todo', 'done'])
    expect(filters.priority).toEqual(['high', 'low'])
    expect(filters.sort).toBe('priority')
    expect(filters.includeClosed).toBe(true)
    expect(filters.project).toBeNull()
    expect(filters.q).toBe('hello')
  })

  it('ignores invalid booleans and over-long searches', () => {
    const filters = parseTaskFiltersQuery({ includeClosed: 'maybe', q: 'x'.repeat(300), status: null })
    expect(filters.includeClosed).toBe(false)
    expect(filters.q).toBe('')
    expect(filters.status).toEqual([])
  })

  it('builds the API query with a fixed project and the board override', () => {
    const filters = { ...emptyTaskFilters(), project: 'other', q: 'x' }
    expect(taskFiltersToApiQuery(filters, { projectSlug: 'mine' })).toEqual({ project: 'mine', q: 'x', sort: 'priority' })
    expect(taskFiltersToApiQuery(filters, { forceIncludeClosed: true, limit: 500 })).toEqual({
      project: 'other', q: 'x', sort: 'priority', includeClosed: 'true', limit: '500',
    })
    expect(taskFiltersToApiQuery(filters, { forceIncludeClosed: true, closedLast: true })).toMatchObject({ includeClosed: 'true', closedLast: 'true' })
    expect(taskFiltersToApiQuery({ ...emptyTaskFilters(), status: ['done'] })).toMatchObject({ status: 'done', includeClosed: 'true' })
  })

  it('counts active filters (sort excluded)', () => {
    expect(countActiveTaskFilters(emptyTaskFilters())).toBe(0)
    expect(countActiveTaskFilters({ ...emptyTaskFilters(), status: ['todo', 'done'], q: 'a', sort: 'due' })).toBe(2)
  })

  it('merges filters into the current query keeping other keys', () => {
    const merged = mergeTaskFiltersIntoQuery(
      { view: 'board', task: 'ABC-1', status: 'todo', q: 'old' },
      { ...emptyTaskFilters(), priority: ['high'] },
    )
    expect(merged).toEqual({ view: 'board', task: 'ABC-1', priority: 'high' })
  })

  it('parses the view', () => {
    expect(parseTaskView('board')).toBe('board')
    expect(parseTaskView(['table'])).toBe('table')
    expect(parseTaskView('grid')).toBeNull()
    expect(parseTaskView(undefined)).toBeNull()
  })
})
