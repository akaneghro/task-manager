// Polls `GET /api/sync` while the tab is visible (and on focus) and calls `refresh` when `lastChange` moves.

import { getCurrentInstance, getCurrentScope, onMounted, onScopeDispose, ref, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { SyncDto } from '#shared/types/dto'

export const AUTO_REFRESH_INTERVAL_MS = 15_000

export interface AutoRefreshOptions {
  /** Project slug to watch, or null/undefined for every visible project. */
  project?: MaybeRefOrGetter<string | null | undefined>
  /** Called when the server reports a change. */
  refresh: () => unknown
  /** While true no check runs (drag or edit in flight). */
  paused?: MaybeRefOrGetter<boolean>
  interval?: number
  /** Injectable for tests. Defaults to `$fetch('/api/sync')`. */
  fetchSync?: (project: string | null) => Promise<SyncDto>
}

function defaultFetchSync(project: string | null): Promise<SyncDto> {
  return $fetch<SyncDto>('/api/sync', { query: project ? { project } : {} }) as Promise<SyncDto>
}

function isDocumentVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible'
}

export function useAutoRefresh(options: AutoRefreshOptions) {
  const interval = options.interval ?? AUTO_REFRESH_INTERVAL_MS
  const fetchSync = options.fetchSync ?? defaultFetchSync
  /** Last `lastChange` seen; `undefined` until the first successful check (baseline). */
  const lastChange = ref<string | null | undefined>(undefined)
  const checking = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null
  let active = false

  const currentProject = () => toValue(options.project) ?? null
  const isPaused = () => toValue(options.paused) ?? false

  async function check(): Promise<void> {
    if (!active || checking.value || isPaused() || !isDocumentVisible()) return
    checking.value = true
    const project = currentProject()
    try {
      const sync = await fetchSync(project)
      // The project changed or a mutation started meanwhile: ignore this answer.
      if (!active || project !== currentProject() || isPaused()) return
      const previous = lastChange.value
      lastChange.value = sync.lastChange
      if (previous !== undefined && previous !== sync.lastChange) await options.refresh()
    }
    catch {
      // Network hiccup: try again on the next tick.
    }
    finally {
      checking.value = false
    }
  }

  function onVisibilityChange() {
    if (isDocumentVisible()) void check()
  }

  function onFocus() {
    void check()
  }

  function start() {
    if (active) return
    active = true
    timer = setInterval(() => void check(), interval)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onFocus)
    void check()
  }

  function stop() {
    active = false
    if (timer) clearInterval(timer)
    timer = null
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange)
    if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus)
  }

  /** Forget the baseline (e.g. after a local mutation already refreshed the data). */
  function reset() {
    lastChange.value = undefined
  }

  watch(currentProject, () => {
    reset()
    void check()
  })

  if (import.meta.client) {
    if (getCurrentInstance()) onMounted(start)
    else start()
  }
  if (getCurrentScope()) onScopeDispose(stop)

  return { lastChange, check, start, stop, reset }
}
