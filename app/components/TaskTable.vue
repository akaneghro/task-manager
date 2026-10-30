<template>
  <div class="card overflow-x-auto">
    <table
      class="w-full min-w-[40rem] border-collapse text-sm"
      :aria-label="$t('tasks.table.label')"
    >
      <thead>
        <tr class="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
          <th
            v-for="col in visibleColumns"
            :key="col.id"
            scope="col"
            class="whitespace-nowrap px-3 py-2 font-medium"
            :class="col.class"
            :aria-sort="col.sort && sort === col.sort ? sortDirection(col.sort) : undefined"
          >
            <button
              v-if="col.sort && sortable"
              type="button"
              class="inline-flex items-center gap-1 uppercase hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-primary-500 dark:hover:text-gray-100"
              :class="sort === col.sort ? 'text-primary-700 dark:text-primary-300' : ''"
              :title="$t('tasks.sort.by', { field: $t(`tasks.fields.${col.id}`) })"
              @click="emit('update:sort', col.sort)"
            >
              {{ $t(`tasks.fields.${col.id}`) }}
              <Icon
                v-if="sort === col.sort"
                name="chevron-down"
                class="size-3"
              />
            </button>
            <template v-else>
              {{ $t(`tasks.fields.${col.id}`) }}
            </template>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="task in tasks"
          :key="task.id"
          class="cursor-pointer border-b border-gray-100 last:border-b-0 hover:bg-gray-50 dark:border-gray-800/70 dark:hover:bg-gray-800/40"
          :class="[task.status === 'cancelled' || task.status === 'done' ? 'text-gray-500 dark:text-gray-400' : '', selectedKey === task.key ? 'bg-primary-50/60 dark:bg-primary-950/40' : '']"
          @click="openTask(task)"
        >
          <td class="whitespace-nowrap px-3 py-2 font-mono text-xs">
            <NuxtLink
              v-if="linkTo"
              :to="linkTo(task)"
              class="text-gray-600 hover:text-primary-600 focus-visible:outline-2 focus-visible:outline-primary-500 dark:text-gray-300 dark:hover:text-primary-400"
              @click.stop
            >
              {{ task.key }}
            </NuxtLink>
            <button
              v-else
              type="button"
              class="text-gray-600 hover:text-primary-600 focus-visible:outline-2 focus-visible:outline-primary-500 dark:text-gray-300 dark:hover:text-primary-400"
              :aria-label="$t('tasks.table.open', { key: task.key })"
              @click.stop="openTask(task)"
            >
              {{ task.key }}
            </button>
          </td>
          <td class="max-w-[28rem] px-3 py-2">
            <div class="flex min-w-0 items-center gap-2">
              <span
                class="truncate font-medium text-gray-900 dark:text-gray-100"
                :class="task.status === 'cancelled' ? 'line-through opacity-70' : ''"
              >{{ task.title }}</span>
              <span
                v-if="isTaskBlocked(task)"
                class="shrink-0 text-red-600 dark:text-red-400"
                :title="$t('tasks.table.blocked')"
              >
                <Icon
                  name="ban"
                  class="size-3.5"
                />
                <span class="sr-only">{{ $t('tasks.table.blocked') }}</span>
              </span>
              <span
                v-if="checklistProgressLabel(task)"
                class="inline-flex shrink-0 items-center gap-0.5 text-xs text-gray-500 dark:text-gray-400"
                :title="$t('tasks.table.checklist', { progress: checklistProgressLabel(task) })"
              >
                <Icon
                  name="checklist"
                  class="size-3.5"
                />
                {{ checklistProgressLabel(task) }}
              </span>
              <span
                v-if="task.commentCount > 0"
                class="inline-flex shrink-0 items-center gap-0.5 text-xs text-gray-500 dark:text-gray-400"
                :title="$t('tasks.table.comments', task.commentCount)"
              >
                <Icon
                  name="comment"
                  class="size-3.5"
                />
                {{ task.commentCount }}
              </span>
            </div>
          </td>
          <td
            v-if="showProject"
            class="max-w-[10rem] truncate whitespace-nowrap px-3 py-2 text-xs text-gray-600 dark:text-gray-400"
          >
            {{ task.projectName }}
          </td>
          <td class="whitespace-nowrap px-3 py-2">
            <StatusBadge :status="task.status" />
          </td>
          <td class="whitespace-nowrap px-3 py-2">
            <PriorityBadge :priority="task.priority" />
          </td>
          <td class="hidden whitespace-nowrap px-3 py-2 lg:table-cell">
            <TypeBadge :type="task.type" />
          </td>
          <td class="hidden whitespace-nowrap px-3 py-2 md:table-cell">
            <SizeBadge :size="task.size" />
          </td>
          <td class="hidden whitespace-nowrap px-3 py-2 lg:table-cell">
            <ExecutorBadge
              :executor="task.executor"
              icon-only
            />
          </td>
          <td class="hidden max-w-[9rem] px-3 py-2 md:table-cell">
            <AssigneeLabel :assignee="task.assignee" />
          </td>
          <td class="whitespace-nowrap px-3 py-2 text-xs">
            <span
              v-if="task.dueDate"
              :class="isTaskOverdue(task, today) ? 'font-medium text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'"
              :title="isTaskOverdue(task, today) ? $t('tasks.table.overdue') : undefined"
            >
              {{ formatDate(task.dueDate, locale) }}
            </span>
            <span
              v-else
              class="text-gray-300 dark:text-gray-600"
              aria-hidden="true"
            >—</span>
          </td>
          <td
            class="hidden whitespace-nowrap px-3 py-2 text-xs text-gray-500 xl:table-cell dark:text-gray-400"
            :title="formatDateTime(task.updatedAt, locale)"
          >
            {{ formatRelative(task.updatedAt, locale, now) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import type { TaskSummaryDto } from '#shared/types/dto'
import type { TaskSort } from '#shared/schemas/task'
import { checklistProgressLabel, isTaskBlocked, isTaskOverdue } from '~/utils/taskDisplay'

type ColumnId = 'key' | 'title' | 'project' | 'status' | 'priority' | 'type' | 'size' | 'executor' | 'assignee' | 'due' | 'updated'

const props = defineProps<{
  tasks: TaskSummaryDto[]
  showProject?: boolean
  /** Public / read-only contexts. The table itself never edits, this only disables sorting. */
  readonly?: boolean
  /** When set, a row navigates to this URL instead of emitting `open`. */
  linkTo?: (task: TaskSummaryDto) => string
  /** Current sort; when provided (and not readonly) the headers become sort buttons. */
  sort?: TaskSort
  /** Key of the task opened in the drawer (highlighted). */
  selectedKey?: string | null
}>()
const emit = defineEmits<{
  'open': [task: TaskSummaryDto]
  'update:sort': [sort: TaskSort]
}>()
const { locale } = useI18n()
const now = useNow()

const today = computed(() => todayIso(now.value))
const sortable = computed(() => !props.readonly && props.sort !== undefined)

const columns: { id: ColumnId, sort?: TaskSort, class?: string }[] = [
  { id: 'key', sort: 'key' },
  { id: 'title' },
  { id: 'project' },
  { id: 'status' },
  { id: 'priority', sort: 'priority' },
  { id: 'type', class: 'hidden lg:table-cell' },
  { id: 'size', class: 'hidden md:table-cell' },
  { id: 'executor', class: 'hidden lg:table-cell' },
  { id: 'assignee', class: 'hidden md:table-cell' },
  { id: 'due', sort: 'due' },
  { id: 'updated', sort: 'updated', class: 'hidden xl:table-cell' },
]

const visibleColumns = computed(() => columns.filter(col => col.id !== 'project' || props.showProject))

/** Server sort directions: priority/due/key ascending, updated descending. */
function sortDirection(sort: TaskSort): 'ascending' | 'descending' {
  return sort === 'updated' || sort === 'created' ? 'descending' : 'ascending'
}

function openTask(task: TaskSummaryDto) {
  if (props.linkTo) void navigateTo(props.linkTo(task))
  else emit('open', task)
}
</script>
