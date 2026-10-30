<template>
  <div>
    <div
      v-if="error"
      class="mx-auto max-w-6xl px-4 py-10"
    >
      <EmptyState
        icon="folder"
        :title="$t('project.notFound')"
        :description="apiError.message(error)"
      />
    </div>

    <template v-else-if="project">
      <ProjectHeader :project="project" />
      <div class="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div
          v-if="!project.capabilities?.vault"
          class="card"
        >
          <EmptyState
            icon="lock"
            :title="$t('errors.forbidden')"
            :description="$t('vault.forbidden')"
          />
        </div>
        <VaultList
          v-else
          :slug="project.slug"
        />
      </div>
    </template>

    <p
      v-else-if="pending"
      class="px-6 py-10 text-sm text-gray-500"
    >
      {{ $t('ui.loading') }}
    </p>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const { t } = useI18n()
const apiError = useApiError()

const slug = computed(() => String(route.params.slug))
const { project, pending, error } = useProject(slug)

usePageTitle(() => (project.value ? `${project.value.name} · ${t('vault.title')}` : null))
</script>
