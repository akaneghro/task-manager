<template>
  <span
    class="inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset"
    :class="taskTypeClass(type)"
  >
    {{ $t(taskTypeLabelKey(type)) }}
  </span>
</template>

<script setup lang="ts">
import type { TaskType } from '#shared/utils/enums'
import { taskTypeClass, taskTypeLabelKey } from '~/utils/taskDisplay'

defineProps<{ type: TaskType }>()
</script>
