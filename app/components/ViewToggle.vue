<template>
  <div
    class="inline-flex rounded-md border border-gray-300 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-900"
    role="radiogroup"
    :aria-label="$t('tasks.view.label')"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      :title="$t(`tasks.view.${option.value}`)"
      class="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary-500"
      :class="model === option.value
        ? 'bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300'
        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'"
      @click="model = option.value"
    >
      <Icon
        :name="option.icon"
        class="size-4"
      />
      <span class="hidden sm:inline">{{ $t(`tasks.view.${option.value}`) }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { TaskView } from '~/composables/useTaskFilters'

const model = defineModel<TaskView>({ required: true })

const options = [
  { value: 'table', icon: 'table' },
  { value: 'board', icon: 'board' },
] as const
</script>
