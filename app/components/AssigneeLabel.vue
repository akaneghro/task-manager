<template>
  <span
    class="inline-flex min-w-0 items-center gap-1 text-xs"
    :class="assignee.kind === 'none' ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'"
  >
    <Icon
      :name="icon"
      class="size-3.5 shrink-0"
      :class="assignee.kind === 'claude' ? 'text-primary-600 dark:text-primary-400' : ''"
    />
    <span class="truncate">{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
import type { AssigneeDto } from '#shared/types/dto'
import type { IconName } from './Icon.vue'
import { assigneeDisplayName, taskAssigneeLabelKey } from '~/utils/taskDisplay'

const props = defineProps<{ assignee: AssigneeDto }>()
const { t } = useI18n()

const icon = computed<IconName>(() => {
  switch (props.assignee.kind) {
    case 'claude': return 'sparkles'
    case 'external': return 'users'
    case 'none': return 'user'
    default: return 'person'
  }
})

const label = computed(() => assigneeDisplayName(props.assignee) ?? t(taskAssigneeLabelKey(props.assignee.kind)))
</script>
