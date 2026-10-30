<template>
  <div class="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6">
    <NuxtLink
      :to="backLink"
      class="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400"
    >
      <Icon
        name="arrow-left"
        class="size-4"
      />
      {{ $t('tasks.detail.back') }}
    </NuxtLink>

    <div
      v-if="pending && !task"
      class="card space-y-3 p-6"
      aria-busy="true"
    >
      <div class="h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
      <div class="h-7 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
      <div class="h-40 animate-pulse rounded bg-gray-100 dark:bg-gray-900" />
    </div>
    <div
      v-else-if="task"
      class="card p-4 sm:p-6"
    >
      <TaskDetail
        :task="task"
        @updated="setTask"
        @deleted="onDeleted"
      />
    </div>
    <EmptyState
      v-else
      icon="alert"
      :title="$t('tasks.detail.notFound')"
      :description="$t('tasks.detail.notFoundDescription')"
    />
  </div>
</template>

<script setup lang="ts">
import type { TaskDetailDto } from '#shared/types/dto'
import { useUiStore } from '~/stores/ui'

const route = useRoute()
const ui = useUiStore()
const key = computed(() => String(route.params.key ?? ''))

const { task, pending, setTask, refresh } = useTask(key)
usePageTitle(() => (task.value ? `${task.value.key} ${task.value.title}` : key.value))

const backLink = computed(() => (task.value ? `/projects/${task.value.projectSlug}/tasks` : '/tasks'))

useAutoRefresh({ project: () => task.value?.projectSlug ?? null, refresh, paused: () => ui.busy })

async function onDeleted(deleted: TaskDetailDto) {
  await navigateTo(`/projects/${deleted.projectSlug}/tasks`)
}
</script>
