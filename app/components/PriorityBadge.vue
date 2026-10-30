<template>
  <span
    class="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset"
    :class="taskPriorityClass(priority)"
    :title="iconOnly ? $t(taskPriorityLabelKey(priority)) : undefined"
  >
    <Icon
      name="flag"
      class="size-3 shrink-0"
      :class="TASK_PRIORITY_ICON_CLASSES[priority]"
    />
    <span :class="iconOnly ? 'sr-only' : ''">{{ $t(taskPriorityLabelKey(priority)) }}</span>
  </span>
</template>

<script setup lang="ts">
import type { TaskPriority } from '#shared/utils/enums'
import { TASK_PRIORITY_ICON_CLASSES, taskPriorityClass, taskPriorityLabelKey } from '~/utils/taskDisplay'

defineProps<{ priority: TaskPriority, iconOnly?: boolean }>()
</script>
