<template>
  <div class="mx-auto w-full max-w-screen-2xl space-y-4 px-4 py-4 sm:px-6">
    <header class="flex flex-wrap items-center gap-3">
      <div class="min-w-0">
        <NuxtLink
          :to="`/projects/${slug}`"
          class="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400"
        >
          <Icon
            name="folder"
            class="size-3.5"
          />
          {{ project?.name ?? slug }}
        </NuxtLink>
        <h1 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
          {{ $t('tasks.title') }}
        </h1>
      </div>
      <ViewToggle v-model="page.view.value" />
      <QuickAdd
        v-if="canEdit"
        class="w-full lg:ml-auto lg:w-auto lg:min-w-[28rem]"
        :project-slug="slug"
        @created="page.onTaskCreated"
      />
    </header>

    <TaskFilters
      v-model="page.filters.value"
      :total="page.total.value"
      :shown="page.tasks.value.length"
    />

    <div
      v-if="page.error.value && page.tasks.value.length === 0"
      class="card flex flex-col items-center gap-3 p-8 text-sm text-red-700 dark:text-red-300"
      role="alert"
    >
      {{ $t('tasks.loadError') }}
      <button
        type="button"
        class="btn-secondary"
        @click="page.refresh()"
      >
        <Icon
          name="refresh"
          class="size-4"
        />
        {{ $t('tasks.retry') }}
      </button>
    </div>
    <TaskBoard
      v-else-if="page.view.value === 'board'"
      :tasks="page.tasks.value"
      :readonly="!canEdit"
      @open="page.openTask"
      @updated="page.onTaskUpdated"
      @refresh="page.refresh()"
    />
    <EmptyState
      v-else-if="!page.pending.value && page.tasks.value.length === 0"
      icon="checklist"
      :title="$t('tasks.empty.title')"
      :description="page.activeCount.value > 0 ? $t('tasks.empty.filtered') : (canEdit ? $t('tasks.empty.description') : $t('tasks.empty.readonly'))"
    >
      <button
        v-if="page.activeCount.value > 0"
        type="button"
        class="btn-secondary"
        @click="page.clearFilters()"
      >
        {{ $t('tasks.filters.clear') }}
      </button>
    </EmptyState>
    <TaskTable
      v-else
      :tasks="page.tasks.value"
      :sort="page.sort.value"
      :selected-key="page.openKey.value"
      @open="page.openTask"
      @update:sort="page.sort.value = $event"
    />

    <p
      v-if="canEdit"
      class="hidden text-xs text-gray-400 sm:block dark:text-gray-500"
    >
      {{ $t('tasks.shortcutsHint') }}
    </p>

    <TaskDrawer
      @updated="page.onTaskUpdated"
      @deleted="page.onTaskDeleted"
    />
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const { t } = useI18n()

const slug = computed(() => String(route.params.slug ?? ''))
const { project } = useProject(slug)
usePageTitle(() => (project.value ? t('tasks.projectTitle', { project: project.value.name }) : t('tasks.title')))

const canEdit = computed(() => project.value?.capabilities?.edit ?? false)
const page = useTaskListPage({ projectSlug: slug.value })
</script>
