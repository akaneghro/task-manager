// One task (`GET /api/tasks/:ref`), keyed `task:<REF>` so it can be refreshed with `refreshNuxtData`.

import type { MaybeRefOrGetter } from 'vue'
import type { TaskDetailDto } from '#shared/types/dto'

export function taskDataKey(ref: string): string {
  return `task:${ref.toUpperCase()}`
}

export function useTask(taskRef: MaybeRefOrGetter<string | null | undefined>) {
  const current = computed(() => {
    const value = toValue(taskRef)
    return value ? value.trim() : null
  })

  // `useRequestFetch` forwards the session cookie during SSR (plain `$fetch` would hit the API anonymously -> 401).
  const requestFetch = useRequestFetch()

  const { data, pending, error, refresh, status } = useAsyncData<TaskDetailDto | null>(
    () => (current.value ? taskDataKey(current.value) : 'task:none'),
    () => (current.value
      ? requestFetch<TaskDetailDto>(`/api/tasks/${encodeURIComponent(current.value)}`) as Promise<TaskDetailDto>
      : Promise.resolve(null)),
    { default: () => null },
  )

  function setTask(task: TaskDetailDto | null) {
    data.value = task
  }

  return { task: data, pending, status, error, refresh, setTask, taskRef: current }
}
