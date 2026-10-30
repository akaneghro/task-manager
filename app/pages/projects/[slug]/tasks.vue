<template>
  <div>
    <div
      v-if="projectMissing"
      class="mx-auto max-w-6xl px-4 py-10"
    >
      <EmptyState
        icon="folder"
        :title="$t('project.notFound')"
        :description="$t('project.notFoundHint')"
      >
        <NuxtLink
          to="/projects"
          class="btn-secondary"
        >
          {{ $t('nav.projects') }}
        </NuxtLink>
      </EmptyState>
    </div>

    <template v-else>
      <ProjectHeader
        v-if="project"
        :project="project"
      />

      <div class="mx-auto w-full max-w-screen-2xl space-y-4 px-4 py-4 sm:px-6">
        <header class="flex flex-wrap items-center gap-3">
          <h2 :class="project ? 'sr-only' : 'text-xl font-semibold text-gray-900 dark:text-gray-100'">
            {{ $t('tasks.title') }}
          </h2>
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
          :total="page.total.value"
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
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const { t } = useI18n()
const apiError = useApiError()

const slug = computed(() => String(route.params.slug ?? ''))
const { project, error: projectError, ready } = useProject(slug)
usePageTitle(() => (project.value ? t('tasks.projectTitle', { project: project.value.name }) : t('tasks.title')))

const canEdit = computed(() => project.value?.capabilities?.edit ?? false)
const page = useTaskListPage({ projectSlug: slug.value })

/** Unknown (or invisible) project: the project or its task list answered 404. */
const projectMissing = computed(() => !project.value
  && (apiError.status(projectError.value) === 404 || apiError.status(page.error.value) === 404))

// Unknown projects render an in-page message but still answer with the real HTTP status (like the public pages).
await useSsrStatus(ready, () => (apiError.status(projectError.value) === 404 ? 404 : null))
</script>
