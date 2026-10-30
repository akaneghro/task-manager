<template>
  <div class="mx-auto w-full max-w-screen-2xl space-y-4 px-4 py-4 sm:px-6">
    <header class="flex flex-wrap items-center gap-3">
      <h1 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
        {{ $t('tasks.allTitle') }}
      </h1>
      <ViewToggle v-model="page.view.value" />
      <QuickAdd
        class="w-full lg:ml-auto lg:w-auto lg:min-w-[30rem]"
        @created="page.onTaskCreated"
      />
    </header>

    <TaskFilters
      v-model="page.filters.value"
      show-project
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
      show-project
      :can-edit="page.canEditTask"
      @open="page.openTask"
      @updated="page.onTaskUpdated"
      @refresh="page.refresh()"
    />
    <EmptyState
      v-else-if="!page.pending.value && page.tasks.value.length === 0"
      icon="checklist"
      :title="$t('tasks.empty.title')"
      :description="page.activeCount.value > 0 ? $t('tasks.empty.filtered') : $t('tasks.empty.description')"
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
      show-project
      :sort="page.sort.value"
      :selected-key="page.openKey.value"
      @open="page.openTask"
      @update:sort="page.sort.value = $event"
    />

    <p class="hidden text-xs text-gray-400 sm:block dark:text-gray-500">
      {{ $t('tasks.shortcutsHint') }}
    </p>

    <TaskDrawer
      @updated="page.onTaskUpdated"
      @deleted="page.onTaskDeleted"
    />
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
usePageTitle(() => t('tasks.allTitle'))

const page = useTaskListPage()
</script>
