<template>
  <span
    class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset"
    :class="taskStatusClass(status)"
  >
    <span
      class="size-1.5 shrink-0 rounded-full"
      :class="TASK_STATUS_DOT_CLASSES[status]"
      aria-hidden="true"
    />
    {{ $t(taskStatusLabelKey(status)) }}
  </span>
</template>

<script setup lang="ts">
import type { TaskStatus } from '#shared/utils/enums'
import { TASK_STATUS_DOT_CLASSES, taskStatusClass, taskStatusLabelKey } from '~/utils/taskDisplay'

defineProps<{ status: TaskStatus }>()
</script>
