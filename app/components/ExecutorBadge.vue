<template>
  <span
    class="inline-flex items-center gap-1 whitespace-nowrap text-xs text-gray-600 dark:text-gray-300"
    :title="$t(taskExecutorLabelKey(executor))"
  >
    <span class="inline-flex items-center -space-x-0.5">
      <Icon
        v-for="icon in TASK_EXECUTOR_ICONS[executor]"
        :key="icon"
        :name="icon"
        class="size-4"
        :class="icon === 'robot' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'"
      />
    </span>
    <span :class="iconOnly ? 'sr-only' : ''">{{ $t(taskExecutorLabelKey(executor)) }}</span>
  </span>
</template>

<script setup lang="ts">
import type { TaskExecutor } from '#shared/utils/enums'
import { TASK_EXECUTOR_ICONS, taskExecutorLabelKey } from '~/utils/taskDisplay'

defineProps<{ executor: TaskExecutor, iconOnly?: boolean }>()
</script>
