// Task list filters bound to the URL query (same semantics as `listTasksQuerySchema`) + the table/board view.

import type { LocationQuery, LocationQueryRaw } from 'vue-router'
import {
  ASSIGNEE_KINDS,
  TASK_EXECUTORS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
} from '#shared/utils/enums'
import type { AssigneeKind, TaskExecutor, TaskPriority, TaskStatus, TaskType } from '#shared/utils/enums'
import { listTasksQuerySchema } from '#shared/schemas/task'
import type { TaskSort } from '#shared/schemas/task'

export interface TaskFilters {
  status: TaskStatus[]
  priority: TaskPriority[]
  type: TaskType[]
  executor: TaskExecutor[]
  assignee: AssigneeKind[]
  /** Project slug (global page only). */
  project: string | null
  q: string
  includeClosed: boolean
  sort: TaskSort
}

export type TaskFilterListKey = 'status' | 'priority' | 'type' | 'executor' | 'assignee'

export const TASK_FILTER_LIST_OPTIONS = {
  status: TASK_STATUSES,
  priority: TASK_PRIORITIES,
  type: TASK_TYPES,
  executor: TASK_EXECUTORS,
  assignee: ASSIGNEE_KINDS,
} as const

/** Query keys owned by the filters (other keys such as `view` / `task` are preserved). */
export const TASK_FILTER_QUERY_KEYS = ['status', 'priority', 'type', 'executor', 'assignee', 'project', 'q', 'includeClosed', 'sort'] as const

export const DEFAULT_TASK_SORT: TaskSort = 'priority'

export function emptyTaskFilters(): TaskFilters {
  return {
    status: [],
    priority: [],
    type: [],
    executor: [],
    assignee: [],
    project: null,
    q: '',
    includeClosed: false,
    sort: DEFAULT_TASK_SORT,
  }
}

/** A raw query value (`string | null | (string | null)[]`) or anything else (ignored). */
type QueryValue = unknown

function queryStrings(value: QueryValue): string[] {
  const values = Array.isArray(value) ? value : [value]
  return values.filter((v): v is string => typeof v === 'string')
}

function firstQueryString(value: QueryValue): string | null {
  return queryStrings(value)[0] ?? null
}

/** Comma separated or repeated values; unknown entries are dropped (lenient version of `queryEnumList`). */
function parseEnumList<T extends string>(value: QueryValue, allowed: readonly T[]): T[] {
  const parts = queryStrings(value).flatMap(v => v.split(',')).map(v => v.trim()).filter(Boolean)
  const result: T[] = []
  for (const part of parts) {
    const match = allowed.find(a => a === part)
    if (match && !result.includes(match)) result.push(match)
  }
  return result
}

/** URL query -> filters. Invalid values fall back to the defaults. */
export function parseTaskFiltersQuery(query: Record<string, QueryValue>): TaskFilters {
  const shape = listTasksQuerySchema.shape
  const includeClosed = shape.includeClosed.safeParse(firstQueryString(query.includeClosed) ?? undefined)
  const sort = shape.sort.safeParse(firstQueryString(query.sort) ?? undefined)
  const q = shape.q.safeParse(firstQueryString(query.q) ?? undefined)
  const project = (firstQueryString(query.project) ?? '').trim()
  return {
    status: parseEnumList(query.status, TASK_STATUSES),
    priority: parseEnumList(query.priority, TASK_PRIORITIES),
    type: parseEnumList(query.type, TASK_TYPES),
    executor: parseEnumList(query.executor, TASK_EXECUTORS),
    assignee: parseEnumList(query.assignee, ASSIGNEE_KINDS),
    project: project && project !== 'all' ? project : null,
    q: q.success ? (q.data ?? '') : '',
    includeClosed: includeClosed.success ? includeClosed.data : false,
    sort: sort.success ? sort.data : DEFAULT_TASK_SORT,
  }
}

/** Filters -> URL query (defaults omitted, lists comma separated). */
export function taskFiltersToQuery(filters: TaskFilters): Record<string, string> {
  const query: Record<string, string> = {}
  for (const key of Object.keys(TASK_FILTER_LIST_OPTIONS) as TaskFilterListKey[]) {
    if (filters[key].length > 0) query[key] = filters[key].join(',')
  }
  if (filters.project) query.project = filters.project
  const q = filters.q.trim()
  if (q) query.q = q
  if (filters.includeClosed) query.includeClosed = 'true'
  if (filters.sort !== DEFAULT_TASK_SORT) query.sort = filters.sort
  return query
}

/** Query for `GET /api/tasks`. A fixed `projectSlug` (project page) wins over the project filter. */
export function taskFiltersToApiQuery(
  filters: TaskFilters,
  options: { projectSlug?: string | null, forceIncludeClosed?: boolean, closedLast?: boolean, limit?: number } = {},
): Record<string, string> {
  const query = taskFiltersToQuery(filters)
  const project = options.projectSlug ?? filters.project
  if (project) query.project = project
  else delete query.project
  // A status filter that names closed statuses implies including them.
  const asksClosed = filters.status.some(s => s === 'done' || s === 'cancelled')
  if (filters.includeClosed || options.forceIncludeClosed || asksClosed) query.includeClosed = 'true'
  query.sort = filters.sort
  if (options.closedLast) query.closedLast = 'true'
  if (options.limit) query.limit = String(options.limit)
  return query
}

/** Number of active filters (sort is not a filter). */
export function countActiveTaskFilters(filters: TaskFilters): number {
  let count = 0
  for (const key of Object.keys(TASK_FILTER_LIST_OPTIONS) as TaskFilterListKey[]) {
    if (filters[key].length > 0) count++
  }
  if (filters.project) count++
  if (filters.q.trim()) count++
  if (filters.includeClosed) count++
  return count
}

/** Replaces the filter keys of `current` with `filters`, keeping unrelated keys (view, task...). */
export function mergeTaskFiltersIntoQuery(current: LocationQuery, filters: TaskFilters): LocationQueryRaw {
  const next: LocationQueryRaw = {}
  for (const [key, value] of Object.entries(current)) {
    if (!(TASK_FILTER_QUERY_KEYS as readonly string[]).includes(key)) next[key] = value
  }
  return { ...next, ...taskFiltersToQuery(filters) }
}

/**
 * Reactive filters stored in the URL query. `global: false` (project page) ignores the `project` filter.
 */
export function useTaskFilters(options: { global?: boolean } = {}) {
  const route = useRoute()
  const router = useRouter()
  const global = options.global ?? true

  const filters = computed<TaskFilters>({
    get: () => {
      const parsed = parseTaskFiltersQuery(route.query)
      return global ? parsed : { ...parsed, project: null }
    },
    set: (value) => {
      void router.replace({ query: mergeTaskFiltersIntoQuery(route.query, global ? value : { ...value, project: null }) })
    },
  })

  const activeCount = computed(() => countActiveTaskFilters(filters.value))

  function update(patch: Partial<TaskFilters>) {
    filters.value = { ...filters.value, ...patch }
  }

  function clear() {
    filters.value = { ...emptyTaskFilters(), sort: filters.value.sort }
  }

  return { filters, activeCount, update, clear }
}

export type TaskView = 'table' | 'board'
export const TASK_VIEW_STORAGE_KEY = 'task-manager-task-view'

export function parseTaskView(value: unknown): TaskView | null {
  const v = firstQueryString(value)
  return v === 'table' || v === 'board' ? v : null
}

function readStoredView(): TaskView | null {
  try {
    return parseTaskView(localStorage.getItem(TASK_VIEW_STORAGE_KEY))
  }
  catch {
    return null
  }
}

function storeView(view: TaskView) {
  try {
    localStorage.setItem(TASK_VIEW_STORAGE_KEY, view)
  }
  catch {
    // Storage unavailable (private mode, blocked): the URL still carries the view.
  }
}

/** `?view=table|board`, remembered in localStorage for the next visit without `?view`. */
export function useTaskView() {
  const route = useRoute()
  const router = useRouter()

  const view = computed<TaskView>({
    get: () => parseTaskView(route.query.view) ?? 'table',
    set: (value) => {
      storeView(value)
      void router.replace({ query: { ...route.query, view: value } })
    },
  })

  onMounted(() => {
    if (parseTaskView(route.query.view)) return
    const stored = readStoredView()
    if (stored && stored !== 'table') void router.replace({ query: { ...route.query, view: stored } })
  })

  return view
}
