// Transient UI state shared by the tasks pages: busy flag (pauses auto refresh), shortcut signals,
// collapsed kanban columns.

import { defineStore } from 'pinia'
import type { TaskStatus } from '#shared/utils/enums'

export const useUiStore = defineStore('ui', () => {
  /** Number of mutations / drags in flight. While > 0 the auto refresh is paused. */
  const busyCount = ref(0)
  const busy = computed(() => busyCount.value > 0)

  /** Incremented to ask the QuickAdd input to take focus (shortcut `n`). */
  const quickAddSignal = ref(0)
  /** Incremented to ask the TaskFilters search input to take focus (shortcut `/`). */
  const searchSignal = ref(0)

  /** Kanban columns collapsed by the user (done / cancelled start collapsed). */
  const collapsedColumns = ref<Partial<Record<TaskStatus, boolean>>>({ done: true, cancelled: true })

  function beginBusy() {
    busyCount.value++
  }

  function endBusy() {
    busyCount.value = Math.max(0, busyCount.value - 1)
  }

  /** Runs `fn` with the busy flag raised. */
  async function track<T>(fn: () => Promise<T>): Promise<T> {
    beginBusy()
    try {
      return await fn()
    }
    finally {
      endBusy()
    }
  }

  function requestQuickAdd() {
    quickAddSignal.value++
  }

  function requestSearchFocus() {
    searchSignal.value++
  }

  function toggleColumn(status: TaskStatus) {
    collapsedColumns.value = { ...collapsedColumns.value, [status]: !collapsedColumns.value[status] }
  }

  return {
    busyCount,
    busy,
    quickAddSignal,
    searchSignal,
    collapsedColumns,
    beginBusy,
    endBusy,
    track,
    requestQuickAdd,
    requestSearchFocus,
    toggleColumn,
  }
})
