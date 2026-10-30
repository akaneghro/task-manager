<template>
  <div>
    <EmptyState
      v-if="error"
      icon="ban"
      :title="$t('public.notFound')"
      :description="$t('public.notFoundHint')"
    />

    <p
      v-else-if="!data"
      class="text-sm text-gray-500"
    >
      {{ $t('ui.loading') }}
    </p>

    <template v-else>
      <header class="mb-6">
        <div class="flex flex-wrap items-center gap-2">
          <span
            class="size-3.5 shrink-0 rounded"
            :style="{ backgroundColor: data.project.color || undefined }"
            :class="data.project.color ? '' : 'bg-gray-300 dark:bg-gray-600'"
            aria-hidden="true"
          />
          <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-50">
            {{ data.project.name }}
          </h1>
          <span class="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">{{ data.project.key }}</span>
          <ProjectStatusBadge :status="data.project.status" />
        </div>
        <p
          v-if="data.project.description"
          class="mt-2 max-w-3xl text-sm whitespace-pre-line text-gray-600 dark:text-gray-300"
        >
          {{ data.project.description }}
        </p>
        <ul
          v-if="data.links.length > 0"
          class="mt-3 flex flex-wrap gap-x-4 gap-y-1"
        >
          <li
            v-for="link in data.links"
            :key="link.id"
          >
            <a
              :href="link.url"
              target="_blank"
              rel="noopener noreferrer nofollow"
              class="inline-flex items-center gap-1 text-sm text-primary-700 hover:underline dark:text-primary-400"
            >
              <Icon
                :name="link.kind === 'repo' ? 'github' : 'link'"
                class="size-3.5"
              />
              {{ link.label }}
            </a>
          </li>
        </ul>
      </header>

      <section aria-labelledby="public-tasks">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2
            id="public-tasks"
            class="text-base font-semibold text-gray-900 dark:text-gray-100"
          >
            {{ $t('public.tasks') }}
            <span class="ml-1 text-sm font-normal text-gray-500 tabular-nums">{{ filteredTasks.length }}</span>
          </h2>
          <div
            class="flex flex-wrap gap-1.5"
            role="group"
            :aria-label="$t('public.filterLabel')"
          >
            <button
              v-for="option in filterOptions"
              :key="option.value"
              type="button"
              class="rounded-full border px-2.5 py-0.5 text-xs font-medium"
              :class="filter === option.value
                ? 'border-primary-600 bg-primary-600 text-white dark:border-primary-500 dark:bg-primary-500'
                : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'"
              :aria-pressed="filter === option.value"
              @click="filter = option.value"
            >
              {{ option.label }}
              <span class="ml-0.5 opacity-70 tabular-nums">{{ option.count }}</span>
            </button>
          </div>
        </div>

        <div
          v-if="filteredTasks.length === 0"
          class="card"
        >
          <EmptyState
            icon="checklist"
            :title="$t('public.noTasks')"
          />
        </div>
        <TaskTable
          v-else
          :tasks="filteredTasks"
          :show-project="false"
          readonly
          :link-to="linkTo"
        />
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { PublicProjectDto, TaskSummaryDto } from '#shared/types/dto'
import { CLOSED_TASK_STATUSES, TASK_STATUSES, type TaskStatus } from '#shared/utils/enums'

definePageMeta({ layout: 'public' })

type Filter = 'open' | 'all' | TaskStatus

const route = useRoute()
const { t } = useI18n()
const token = computed(() => String(route.params.token))

const { data, error } = await useFetch<PublicProjectDto>(
  () => `/api/public/${encodeURIComponent(token.value)}`,
  { key: computed(() => `tm:public:${token.value}`) },
)

// Unknown or revoked links render an in-page message; still answer with the real HTTP status (404).
const requestEvent = useRequestEvent()
if (import.meta.server && requestEvent && error.value) setResponseStatus(requestEvent, error.value.statusCode || 404)

useHead({ title: () => (data.value ? `${data.value.project.name} · Task Manager` : 'Task Manager') })
useSeoMeta({ robots: 'noindex, nofollow' })

const filter = ref<Filter>('open')

const tasks = computed<TaskSummaryDto[]>(() => data.value?.tasks ?? [])

const filterOptions = computed(() => {
  const options: Array<{ value: Filter, label: string, count: number }> = [
    { value: 'open', label: t('public.open'), count: tasks.value.filter(task => !CLOSED_TASK_STATUSES.includes(task.status)).length },
    { value: 'all', label: t('ui.all'), count: tasks.value.length },
  ]
  for (const status of TASK_STATUSES) {
    const count = tasks.value.filter(task => task.status === status).length
    if (count > 0) options.push({ value: status, label: t(`statusCounts.${status}`), count })
  }
  return options
})

const filteredTasks = computed(() => {
  if (filter.value === 'all') return tasks.value
  if (filter.value === 'open') return tasks.value.filter(task => !CLOSED_TASK_STATUSES.includes(task.status))
  return tasks.value.filter(task => task.status === filter.value)
})

function linkTo(task: TaskSummaryDto): string {
  return `/s/${encodeURIComponent(token.value)}/tasks/${encodeURIComponent(task.key)}`
}
</script>
