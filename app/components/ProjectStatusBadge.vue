<template>
  <span
    class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
    :class="STYLES[status]"
  >
    <span
      class="size-1.5 rounded-full"
      :class="DOTS[status]"
      aria-hidden="true"
    />
    {{ $t(`projectStatus.${status}`) }}
  </span>
</template>

<script setup lang="ts">
import type { ProjectStatus } from '#shared/utils/enums'

defineProps<{ status: ProjectStatus }>()

const STYLES: Record<ProjectStatus, string> = {
  idea: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  development: 'bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300',
  production: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  maintenance: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  paused: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  archived: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
}
const DOTS: Record<ProjectStatus, string> = {
  idea: 'bg-violet-500',
  development: 'bg-primary-500',
  production: 'bg-emerald-500',
  maintenance: 'bg-amber-500',
  paused: 'bg-gray-400',
  archived: 'bg-gray-300 dark:bg-gray-600',
}
</script>
