<template>
  <div class="mx-auto max-w-6xl px-4 py-6 sm:px-6">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold text-gray-900 dark:text-gray-50">
        {{ $t('projects.title') }}
      </h1>
      <button
        v-if="isOwner"
        type="button"
        class="btn-primary"
        @click="openCreate"
      >
        <Icon
          name="plus"
          class="size-4"
        />
        {{ $t('projects.new') }}
      </button>
    </div>

    <div
      class="mb-5 flex flex-wrap gap-1.5"
      role="group"
      :aria-label="$t('projects.filterLabel')"
    >
      <button
        v-for="option in filterOptions"
        :key="option.value"
        type="button"
        class="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
        :class="filter === option.value
          ? 'border-primary-600 bg-primary-600 text-white dark:border-primary-500 dark:bg-primary-500'
          : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'"
        :aria-pressed="filter === option.value"
        @click="setFilter(option.value)"
      >
        {{ option.label }}
        <span class="ml-1 opacity-70 tabular-nums">{{ option.count }}</span>
      </button>
    </div>

    <p
      v-if="error"
      class="text-sm text-red-600 dark:text-red-400"
    >
      {{ apiError.message(error) }}
    </p>
    <div
      v-else-if="!pending && projects.length === 0"
      class="card"
    >
      <EmptyState
        icon="folder"
        :title="$t('projects.empty')"
        :description="$t('projects.emptyHint')"
      >
        <button
          v-if="isOwner"
          type="button"
          class="btn-primary"
          @click="openCreate"
        >
          <Icon
            name="plus"
            class="size-4"
          />
          {{ $t('projects.new') }}
        </button>
      </EmptyState>
    </div>
    <div
      v-else-if="visible.length === 0"
      class="card"
    >
      <EmptyState
        icon="filter"
        :title="$t('projects.emptyFiltered')"
      />
    </div>
    <ul
      v-else
      class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
    >
      <li
        v-for="project in visible"
        :key="project.id"
      >
        <NuxtLink
          :to="`/projects/${project.slug}`"
          class="card group flex h-full flex-col gap-3 p-4 transition-shadow hover:border-gray-300 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-primary-500 dark:hover:border-gray-700"
          :class="project.status === 'archived' ? 'opacity-70' : ''"
        >
          <div class="flex items-start gap-2">
            <span
              class="mt-1 size-3 shrink-0 rounded-sm"
              :style="{ backgroundColor: project.color || undefined }"
              :class="project.color ? '' : 'bg-gray-300 dark:bg-gray-600'"
              aria-hidden="true"
            />
            <div class="min-w-0 flex-1">
              <h2 class="truncate font-semibold text-gray-900 group-hover:text-primary-700 dark:text-gray-100 dark:group-hover:text-primary-300">
                {{ project.name }}
              </h2>
              <p class="truncate text-xs text-gray-500 dark:text-gray-400">
                <span class="font-mono">{{ project.key }}</span>
                <template v-if="project.client">
                  · {{ project.client }}
                </template>
                <template v-else-if="project.isInbox">
                  · {{ $t('projects.inboxHint') }}
                </template>
              </p>
            </div>
            <ProjectStatusBadge :status="project.status" />
          </div>
          <p
            v-if="project.description"
            class="line-clamp-2 text-sm text-gray-600 dark:text-gray-300"
          >
            {{ project.description }}
          </p>
          <div class="mt-auto">
            <div
              v-if="totalOf(project) > 0"
              class="mb-2 flex h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
              aria-hidden="true"
            >
              <span
                class="bg-emerald-500"
                :style="{ width: `${(project.counts.done / totalOf(project)) * 100}%` }"
              />
              <span
                class="bg-primary-500"
                :style="{ width: `${((project.counts.in_progress + project.counts.in_review) / totalOf(project)) * 100}%` }"
              />
              <span
                class="bg-red-400"
                :style="{ width: `${(project.counts.blocked / totalOf(project)) * 100}%` }"
              />
            </div>
            <p class="flex gap-3 text-xs text-gray-500 dark:text-gray-400">
              <span>{{ $t('projects.openCount', { n: project.openCount }, project.openCount) }}</span>
              <span>{{ $t('projects.doneCount', { n: project.counts.done }, project.counts.done) }}</span>
            </p>
          </div>
        </NuxtLink>
      </li>
    </ul>

    <AppModal
      v-model:open="createOpen"
      :title="$t('projects.createTitle')"
    >
      <ProjectForm
        v-if="createOpen"
        @saved="onCreated"
        @cancel="createOpen = false"
      />
    </AppModal>
  </div>
</template>

<script setup lang="ts">
import type { ProjectDetailDto, ProjectSummaryDto } from '#shared/types/dto'
import { PROJECT_STATUSES, TASK_STATUSES, type ProjectStatus } from '#shared/utils/enums'

type Filter = 'all' | ProjectStatus

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const apiError = useApiError()
const { projects, pending, error } = useProjects()
const { user } = useUserSession()
const isOwner = computed(() => toSessionUser(user.value)?.role === 'owner')

usePageTitle(() => t('projects.title'))

function isFilter(value: unknown): value is Filter {
  return value === 'all' || PROJECT_STATUSES.some(s => s === value)
}

const filter = computed<Filter>(() => (isFilter(route.query.status) ? route.query.status : 'all'))

function setFilter(value: Filter) {
  router.replace({ query: { ...route.query, status: value === 'all' ? undefined : value } })
}

const filterOptions = computed(() => {
  const active = projects.value.filter(p => p.status !== 'archived')
  const options: Array<{ value: Filter, label: string, count: number }> = [{ value: 'all', label: t('ui.all'), count: active.length }]
  for (const status of PROJECT_STATUS_ORDER) {
    const count = projects.value.filter(p => p.status === status).length
    if (count > 0 || status === filter.value) options.push({ value: status, label: t(`projectStatus.${status}`), count })
  }
  return options
})

const visible = computed(() => {
  const list = filter.value === 'all'
    ? projects.value.filter(p => p.status !== 'archived')
    : projects.value.filter(p => p.status === filter.value)
  // Inbox first, then by status order, then name
  return [...list].sort((a, b) => {
    if (a.isInbox !== b.isInbox) return a.isInbox ? -1 : 1
    const byStatus = PROJECT_STATUS_ORDER.indexOf(a.status) - PROJECT_STATUS_ORDER.indexOf(b.status)
    return byStatus !== 0 ? byStatus : a.name.localeCompare(b.name)
  })
})

function totalOf(project: ProjectSummaryDto): number {
  return TASK_STATUSES.reduce((sum, s) => sum + (s === 'cancelled' ? 0 : project.counts[s]), 0)
}

// Create modal (also opened from the sidebar with ?new=1)
const createOpen = ref(false)

function openCreate() {
  createOpen.value = true
}

function consumeNewQuery() {
  if (!route.query.new) return
  if (isOwner.value) createOpen.value = true
  router.replace({ query: { ...route.query, new: undefined } })
}

onMounted(consumeNewQuery)
watch(() => route.query.new, consumeNewQuery)

async function onCreated(project: ProjectDetailDto) {
  createOpen.value = false
  await navigateTo(`/projects/${project.slug}`)
}
</script>
