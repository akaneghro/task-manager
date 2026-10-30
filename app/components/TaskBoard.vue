<template>
  <div>
    <p
      v-if="truncated"
      class="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
      role="status"
    >
      {{ $t('tasks.board.truncated', { shown: tasks.length, total: total ?? tasks.length }) }}
    </p>
    <div
      class="flex gap-3 overflow-x-auto pb-3"
      role="region"
      :aria-label="$t('tasks.board.label')"
    >
      <section
        v-for="status in TASK_STATUSES"
        :key="status"
        class="flex max-h-[calc(100vh-14rem)] min-h-40 shrink-0 flex-col rounded-lg border border-gray-200 bg-gray-100/70 dark:border-gray-800 dark:bg-gray-900/60"
        :class="isCollapsed(status) ? 'w-44' : 'w-72'"
        :aria-labelledby="`board-col-${status}`"
      >
        <header class="flex items-center justify-between gap-2 px-3 py-2">
          <h3
            :id="`board-col-${status}`"
            class="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300"
          >
            <span
              class="size-2 shrink-0 rounded-full"
              :class="TASK_STATUS_DOT_CLASSES[status]"
              aria-hidden="true"
            />
            <span class="truncate">{{ $t(taskStatusLabelKey(status)) }}</span>
            <span class="rounded-full bg-white px-1.5 text-[11px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              {{ columns[status].length }}
            </span>
          </h3>
          <button
            v-if="COLLAPSIBLE.has(status)"
            type="button"
            class="btn-ghost p-1"
            :aria-expanded="!isCollapsed(status)"
            :aria-label="isCollapsed(status) ? $t('tasks.board.expand') : $t('tasks.board.collapse')"
            @click="ui.toggleColumn(status)"
          >
            <Icon
              :name="isCollapsed(status) ? 'chevron-down' : 'chevron-up'"
              class="size-4"
            />
          </button>
        </header>

        <!-- Collapsed column: a drop zone only (dropped cards go to the top). -->
        <VueDraggable
          v-if="isCollapsed(status)"
          v-model="dropZones[status]"
          :group="GROUP"
          :data-status="status"
          data-collapsed="true"
          class="m-2 mt-0 flex min-h-16 flex-1 items-center justify-center rounded-md border border-dashed border-gray-300 text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500"
          @end="onEnd"
        >
          <div
            v-for="task in dropZones[status]"
            :key="task.id"
            :data-task-id="task.id"
            class="hidden"
          />
          <span
            v-if="dropZones[status].length === 0"
            class="pointer-events-none"
          >{{ $t('tasks.board.dropHere') }}</span>
        </VueDraggable>

        <VueDraggable
          v-else
          v-model="columns[status]"
          :group="GROUP"
          :data-status="status"
          :animation="150"
          filter=".tm-locked"
          :prevent-on-filter="false"
          ghost-class="tm-ghost"
          :disabled="readonly"
          class="flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2"
          @start="onStart"
          @end="onEnd"
        >
          <TaskCard
            v-for="task in columns[status]"
            :key="task.id"
            :data-task-id="task.id"
            :task="task"
            :show-project="showProject"
            :draggable="canDrag(task)"
            :class="canDrag(task) ? '' : 'tm-locked'"
            @open="emit('open', $event)"
          />
          <p
            v-if="columns[status].length === 0"
            class="py-4 text-center text-xs text-gray-400 dark:text-gray-500"
          >
            {{ $t('tasks.board.empty') }}
          </p>
        </VueDraggable>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'
import type { SortableEvent } from 'vue-draggable-plus'
import { TASK_STATUSES } from '#shared/utils/enums'
import type { TaskStatus } from '#shared/utils/enums'
import type { TaskSummaryDto } from '#shared/types/dto'
import { groupTasksByStatus, isSameSpot, isTaskStatus, sameProjectNeighborsOfItem } from '~/utils/kanban'
import type { KanbanColumns } from '~/utils/kanban'
import { TASK_STATUS_DOT_CLASSES, taskStatusLabelKey } from '~/utils/taskDisplay'
import { useUiStore } from '~/stores/ui'

const props = defineProps<{
  tasks: TaskSummaryDto[]
  showProject?: boolean
  readonly?: boolean
  /** Per-task edit permission (global board mixes projects). Defaults to `!readonly`. */
  canEdit?: (task: TaskSummaryDto) => boolean
  /** Total matching tasks on the server; more than `tasks.length` means the list was truncated. */
  total?: number
}>()
const emit = defineEmits<{
  open: [task: TaskSummaryDto]
  /** A move succeeded: the server's summary of the task. */
  updated: [task: TaskSummaryDto]
  /** A conflict happened: the parent should refetch the list. */
  refresh: []
}>()

const { t } = useI18n()
const ui = useUiStore()
const mutations = useTaskMutations()
const toast = useToast()

const GROUP = 'tm-tasks'
const truncated = computed(() => props.total !== undefined && props.total > props.tasks.length)
const COLLAPSIBLE: ReadonlySet<TaskStatus> = new Set<TaskStatus>(['done', 'cancelled'])

const columns = ref<KanbanColumns<TaskSummaryDto>>(groupTasksByStatus(props.tasks))
const dropZones = ref<KanbanColumns<TaskSummaryDto>>(groupTasksByStatus([]))
let snapshot: KanbanColumns<TaskSummaryDto> | null = null
let dragging = false
let inFlight = 0

function cloneColumns(source: KanbanColumns<TaskSummaryDto>): KanbanColumns<TaskSummaryDto> {
  return Object.fromEntries(TASK_STATUSES.map(s => [s, [...source[s]]])) as KanbanColumns<TaskSummaryDto>
}

// Resync from the parent unless a drag or a move request is in progress.
watch(() => props.tasks, (tasks) => {
  if (dragging || inFlight > 0) return
  columns.value = groupTasksByStatus(tasks)
})

function isCollapsed(status: TaskStatus): boolean {
  return COLLAPSIBLE.has(status) && ui.collapsedColumns[status] === true
}

function canDrag(task: TaskSummaryDto): boolean {
  if (props.readonly) return false
  return props.canEdit ? props.canEdit(task) : true
}

function onStart() {
  dragging = true
  snapshot = cloneColumns(columns.value)
  ui.beginBusy()
}

function finishDrag() {
  if (!dragging) return
  dragging = false
  ui.endBusy()
}

async function onEnd(event: SortableEvent) {
  const fromStatus = event.from.dataset.status
  const toStatus = event.to.dataset.status
  const taskId = event.item.dataset.taskId
  const before = snapshot
  snapshot = null
  if (!isTaskStatus(fromStatus) || !isTaskStatus(toStatus) || !taskId || !before) {
    finishDrag()
    return
  }
  if (isSameSpot(fromStatus, toStatus, event.oldIndex, event.newIndex)) {
    finishDrag()
    return
  }

  // A drop into a collapsed column lands in its drop zone: move it to the top of the real column.
  if (event.to.dataset.collapsed === 'true') {
    const dropped = dropZones.value[toStatus].find(task => task.id === taskId)
    dropZones.value[toStatus] = []
    if (dropped) columns.value[toStatus] = [dropped, ...columns.value[toStatus]]
  }

  const column = columns.value[toStatus]
  const task = column.find(item => item.id === taskId)
  if (!task) {
    columns.value = before
    finishDrag()
    return
  }
  // Positions only order cards within one project: ignore other projects' cards (global board).
  const neighbors = sameProjectNeighborsOfItem(column, taskId)
  // Optimistic: the card is already in place; reflect the new status on the card itself.
  columns.value[toStatus] = column.map(item => (item.id === taskId ? { ...item, status: toStatus } : item))

  inFlight++
  finishDrag()
  try {
    const saved = await mutations.moveTask(task, { status: toStatus, ...neighbors })
    columns.value[toStatus] = columns.value[toStatus].map(item => (item.id === saved.id ? saved : item))
    emit('updated', saved)
  }
  catch (err) {
    columns.value = before
    if (isConflictError(err)) {
      toast.info(t('tasks.board.moveConflict'))
      emit('refresh')
    }
    else {
      mutations.reportError(err)
    }
  }
  finally {
    inFlight--
  }
}
</script>

<style scoped>
:deep(.tm-ghost) {
  opacity: 0.4;
}
</style>
