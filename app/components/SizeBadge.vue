<template>
  <span
    v-if="size"
    class="inline-flex min-w-7 items-center justify-center rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold ring-1 ring-inset"
    :class="TASK_SIZE_CLASSES"
    :title="`${$t('tasks.fields.size')}: ${size}`"
  >
    {{ size }}
  </span>
  <span
    v-else-if="showEmpty"
    class="text-xs text-gray-400 dark:text-gray-500"
  >{{ $t('tasks.size.none') }}</span>
</template>

<script setup lang="ts">
import type { TaskSize } from '#shared/utils/enums'
import { TASK_SIZE_CLASSES } from '~/utils/taskDisplay'

defineProps<{ size: TaskSize | null, showEmpty?: boolean }>()
</script>
