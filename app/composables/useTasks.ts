// Task list data (`GET /api/tasks`) with local, optimistic edits of the cached list.

import type { MaybeRefOrGetter } from 'vue'
import type { TaskDetailDto, TaskListDto, TaskSummaryDto } from '#shared/types/dto'
import type { TaskSort } from '#shared/schemas/task'
import type { TaskFilters } from './useTaskFilters'
import { taskFiltersToApiQuery, useTaskFilters, useTaskView } from './useTaskFilters'
import { useAutoRefresh } from './useAutoRefresh'
import { useShortcuts } from './useShortcuts'
import { taskDataKey } from './useTask'
import { toTaskSummary } from '../utils/taskDisplay'
import { useUiStore } from '../stores/ui'

export interface UseTasksOptions {
  /** Fixed project slug (project page). Omit on the global page. */
  project?: MaybeRefOrGetter<string | null | undefined>
  filters: MaybeRefOrGetter<TaskFilters>
  /** The board always needs done/cancelled to fill its columns. */
  forceIncludeClosed?: MaybeRefOrGetter<boolean>
}

export function useTasks(options: UseTasksOptions) {
  const projectSlug = computed(() => toValue(options.project) ?? null)
  const query = computed(() => taskFiltersToApiQuery(toValue(options.filters), {
    projectSlug: projectSlug.value,
    forceIncludeClosed: toValue(options.forceIncludeClosed) ?? false,
    limit: 500,
  }))

  const { data, pending, error, refresh, status } = useFetch<TaskListDto>('/api/tasks', {
    key: `tasks-list:${projectSlug.value ?? 'all'}`,
    query,
    default: () => ({ items: [], total: 0 }),
  })

  const tasks = computed<TaskSummaryDto[]>(() => data.value?.items ?? [])
  const total = computed(() => data.value?.total ?? 0)

  function setTasks(items: TaskSummaryDto[]) {
    const current = data.value ?? { items: [], total: 0 }
    data.value = { items, total: current.total + (items.length - current.items.length) }
  }

  /** Replaces a task of the list (matched by id). Unknown tasks are ignored (the next refresh adds them). */
  function upsertTask(task: TaskSummaryDto | TaskDetailDto) {
    const summary = toTaskSummary(task)
    const items = tasks.value
    const index = items.findIndex(t => t.id === summary.id)
    if (index === -1) return
    const next = [...items]
    next[index] = summary
    setTasks(next)
  }

  function removeTask(id: string) {
    setTasks(tasks.value.filter(t => t.id !== id))
  }

  return { tasks, total, pending, status, error, refresh, setTasks, upsertTask, removeTask, query }
}

/**
 * Everything a task list page needs: URL filters + view, list data, auto refresh, shortcuts and the drawer.
 * `projectSlug` set = project page (the project filter is ignored), omitted = global page.
 */
export function useTaskListPage(options: { projectSlug?: string | null } = {}) {
  const route = useRoute()
  const router = useRouter()
  const ui = useUiStore()
  const projectSlug = options.projectSlug ?? null

  const { filters, activeCount, clear } = useTaskFilters({ global: projectSlug === null })
  const view = useTaskView()
  const list = useTasks({ project: projectSlug, filters, forceIncludeClosed: () => view.value === 'board' })
  const { projects } = useProjects()

  const editableProjectIds = computed(() => new Set(projects.value.filter(p => p.capabilities?.edit ?? false).map(p => p.id)))
  function canEditTask(task: TaskSummaryDto): boolean {
    return editableProjectIds.value.has(task.projectId)
  }

  const sort = computed<TaskSort>({
    get: () => filters.value.sort,
    set: (value) => {
      filters.value = { ...filters.value, sort: value }
    },
  })

  const openKey = computed(() => {
    const value = route.query.task
    const key = Array.isArray(value) ? value[0] : value
    return typeof key === 'string' && key ? key : null
  })

  function openTask(task: TaskSummaryDto) {
    void router.push({ query: { ...route.query, task: task.key } })
  }

  async function refreshAll() {
    const key = openKey.value
    await Promise.all([list.refresh(), key ? refreshNuxtData(taskDataKey(key)) : Promise.resolve()])
  }

  useAutoRefresh({ project: projectSlug, refresh: refreshAll, paused: () => ui.busy })
  useShortcuts({ onNew: ui.requestQuickAdd, onSearch: ui.requestSearchFocus })

  function onTaskUpdated(task: TaskSummaryDto | TaskDetailDto) {
    list.upsertTask(task)
  }

  function onTaskDeleted(task: TaskSummaryDto | TaskDetailDto) {
    list.removeTask(task.id)
  }

  function onTaskCreated() {
    void list.refresh()
  }

  return {
    ...list,
    filters,
    activeCount,
    clearFilters: clear,
    view,
    sort,
    openKey,
    openTask,
    canEditTask,
    refreshAll,
    onTaskUpdated,
    onTaskDeleted,
    onTaskCreated,
  }
}
