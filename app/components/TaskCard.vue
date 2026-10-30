<template>
  <article
    class="group rounded-md border bg-white p-2.5 text-left shadow-xs transition-colors dark:bg-gray-900"
    :class="[
      draggable ? 'cursor-grab active:cursor-grabbing' : '',
      task.status === 'cancelled' ? 'opacity-70' : '',
      'border-gray-200 hover:border-primary-300 dark:border-gray-800 dark:hover:border-primary-700',
    ]"
  >
    <div class="flex items-center justify-between gap-2">
      <button
        type="button"
        class="truncate font-mono text-[11px] font-medium text-gray-500 hover:text-primary-600 focus-visible:outline-2 focus-visible:outline-primary-500 dark:text-gray-400 dark:hover:text-primary-400"
        :aria-label="$t('tasks.table.open', { key: task.key })"
        @click="emit('open', task)"
      >
        {{ task.key }}
      </button>
      <div class="flex shrink-0 items-center gap-1.5">
        <SizeBadge :size="task.size" />
        <ExecutorBadge
          :executor="task.executor"
          icon-only
        />
      </div>
    </div>

    <button
      type="button"
      class="mt-1 block w-full text-left text-sm font-medium text-gray-900 hover:text-primary-700 dark:text-gray-100 dark:hover:text-primary-300"
      :class="task.status === 'cancelled' ? 'line-through' : ''"
      tabindex="-1"
      @click="emit('open', task)"
    >
      <span class="line-clamp-3">{{ task.title }}</span>
    </button>

    <p
      v-if="showProject"
      class="mt-1 truncate text-xs text-gray-500 dark:text-gray-400"
    >
      {{ task.projectName }}
    </p>

    <div class="mt-2 flex flex-wrap items-center gap-1.5">
      <PriorityBadge
        :priority="task.priority"
        icon-only
      />
      <TypeBadge :type="task.type" />
      <span
        v-if="blocked"
        class="inline-flex items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-800"
        :title="blockedTitle"
      >
        <Icon
          name="ban"
          class="size-3"
        />
        {{ $t('tasks.table.blocked') }}
      </span>
    </div>

    <div class="mt-2 flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
      <AssigneeLabel :assignee="task.assignee" />
      <div class="flex shrink-0 items-center gap-2">
        <span
          v-if="progress"
          class="inline-flex items-center gap-0.5"
          :title="$t('tasks.table.checklist', { progress })"
        >
          <Icon
            name="checklist"
            class="size-3.5"
          />
          {{ progress }}
        </span>
        <span
          v-if="task.commentCount > 0"
          class="inline-flex items-center gap-0.5"
          :title="$t('tasks.table.comments', task.commentCount)"
        >
          <Icon
            name="comment"
            class="size-3.5"
          />
          {{ task.commentCount }}
        </span>
        <span
          v-if="task.dueDate"
          class="inline-flex items-center gap-0.5"
          :class="overdue ? 'font-medium text-red-600 dark:text-red-400' : ''"
          :title="overdue ? $t('tasks.table.overdue') : $t('tasks.card.due', { date: formatDate(task.dueDate, locale) })"
        >
          <Icon
            name="calendar"
            class="size-3.5"
          />
          {{ formatDate(task.dueDate, locale) }}
        </span>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { TaskSummaryDto } from '#shared/types/dto'
import { checklistProgressLabel, isTaskBlocked, isTaskOverdue } from '~/utils/taskDisplay'

const props = defineProps<{
  task: TaskSummaryDto
  showProject?: boolean
  draggable?: boolean
}>()
const emit = defineEmits<{ open: [task: TaskSummaryDto] }>()
const { t, locale } = useI18n()
const now = useNow()

const progress = computed(() => checklistProgressLabel(props.task))
const blocked = computed(() => isTaskBlocked(props.task))
const overdue = computed(() => isTaskOverdue(props.task, todayIso(now.value)))

const blockedTitle = computed(() => {
  const parts: string[] = []
  if (props.task.blockedByKeys.length > 0) parts.push(t('tasks.card.blockedBy', { keys: props.task.blockedByKeys.join(', ') }))
  if (props.task.blocker) parts.push(t('tasks.card.waitingOn', { who: props.task.blocker.who }))
  return parts.join(' · ') || t('tasks.status.blocked')
})
</script>
