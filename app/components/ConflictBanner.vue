<template>
  <div
    class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
    role="alert"
  >
    <div class="flex items-start gap-2">
      <Icon
        name="alert"
        class="mt-0.5 size-4 shrink-0"
      />
      <div class="min-w-0 flex-1">
        <p class="font-semibold">
          {{ $t('tasks.conflict.title') }}
        </p>
        <p class="mt-0.5 text-amber-800 dark:text-amber-300">
          {{ $t('tasks.conflict.message') }}
        </p>
        <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <template
            v-for="row in rows"
            :key="row.field"
          >
            <dt class="font-medium">
              {{ $t(`tasks.fields.${row.field}`) }}
            </dt>
            <dd class="min-w-0 truncate">
              {{ row.value }}
            </dd>
          </template>
        </dl>
        <p
          v-if="updatedBy"
          class="mt-2 text-xs text-amber-700 dark:text-amber-400"
        >
          {{ $t('tasks.conflict.by', { who: updatedBy }) }}
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            class="btn-secondary"
            @click="emit('useTheirs')"
          >
            {{ $t('tasks.conflict.useTheirs') }}
          </button>
          <button
            type="button"
            class="btn-primary"
            @click="emit('overwrite')"
          >
            {{ $t('tasks.conflict.overwrite') }}
          </button>
        </div>
      </div>
      <button
        type="button"
        class="btn-ghost -m-1 p-1"
        :aria-label="$t('tasks.conflict.dismiss')"
        @click="emit('dismiss')"
      >
        <Icon
          name="x"
          class="size-4"
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TaskConflict } from '~/composables/useTaskMutations'
import {
  assigneeDisplayName,
  parseTaskSource,
  taskAssigneeLabelKey,
  taskExecutorLabelKey,
  taskPriorityLabelKey,
  taskSizeLabelKey,
  taskStatusLabelKey,
  taskTypeLabelKey,
} from '~/utils/taskDisplay'

type ConflictField = 'title' | 'description' | 'status' | 'priority' | 'type' | 'size' | 'executor' | 'assignee' | 'due' | 'blocker'

const props = defineProps<{ conflict: TaskConflict }>()
const emit = defineEmits<{ useTheirs: [], overwrite: [], dismiss: [] }>()
const { t, locale } = useI18n()

const rows = computed(() => {
  const { patch, current } = props.conflict
  const empty = t('tasks.conflict.empty')
  const out: { field: ConflictField, value: string }[] = []
  if (patch.title !== undefined) out.push({ field: 'title', value: current.title })
  if (patch.description !== undefined) out.push({ field: 'description', value: current.description ? t('tasks.conflict.changed') : empty })
  if (patch.status !== undefined) out.push({ field: 'status', value: t(taskStatusLabelKey(current.status)) })
  if (patch.priority !== undefined) out.push({ field: 'priority', value: t(taskPriorityLabelKey(current.priority)) })
  if (patch.type !== undefined) out.push({ field: 'type', value: t(taskTypeLabelKey(current.type)) })
  if (patch.size !== undefined) out.push({ field: 'size', value: t(taskSizeLabelKey(current.size)) })
  if (patch.executor !== undefined) out.push({ field: 'executor', value: t(taskExecutorLabelKey(current.executor)) })
  if (patch.assignee !== undefined) {
    out.push({ field: 'assignee', value: assigneeDisplayName(current.assignee) ?? t(taskAssigneeLabelKey(current.assignee.kind)) })
  }
  if (patch.dueDate !== undefined) out.push({ field: 'due', value: current.dueDate ? formatDate(current.dueDate, locale.value) : empty })
  if (patch.blocker !== undefined) out.push({ field: 'blocker', value: current.blocker ? `${current.blocker.who}: ${current.blocker.what}` : empty })
  return out
})

const updatedBy = computed(() => {
  const source = parseTaskSource(props.conflict.current.updatedBy)
  return source.kind === 'mcp' ? t('tasks.meta.claude', { name: source.name }) : null
})
</script>
