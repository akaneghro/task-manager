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

      <div class="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
        <div
          v-if="!project.capabilities?.manage"
          class="card"
        >
          <EmptyState
            icon="lock"
            :title="$t('errors.forbidden')"
            :description="$t('projectSettings.forbidden')"
          />
        </div>

        <template v-else>
          <section
            class="card p-4 sm:p-5"
            aria-labelledby="settings-general"
          >
            <h2
              id="settings-general"
              class="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100"
            >
              {{ $t('projectSettings.general') }}
            </h2>
            <ProjectForm
              :project="project"
              :cancelable="false"
              @saved="onSaved"
              @conflict="onConflict"
            />
          </section>

          <section
            class="card p-4 sm:p-5"
            aria-labelledby="settings-links"
          >
            <h2
              id="settings-links"
              class="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100"
            >
              {{ $t('projectSettings.links') }}
            </h2>
            <ProjectLinksEditor
              :slug="project.slug"
              :links="project.links"
              @saved="onLinksSaved"
            />
          </section>

          <section
            class="card p-4 sm:p-5"
            aria-labelledby="settings-members"
          >
            <h2
              id="settings-members"
              class="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100"
            >
              <Icon
                name="users"
                class="size-4"
              />
              {{ $t('projectSettings.members') }}
            </h2>
            <MembersManager :slug="project.slug" />
          </section>

          <section
            class="card p-4 sm:p-5"
            aria-labelledby="settings-share"
          >
            <h2
              id="settings-share"
              class="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100"
            >
              <Icon
                name="share"
                class="size-4"
              />
              {{ $t('projectSettings.shareLinks') }}
            </h2>
            <ShareLinksManager :slug="project.slug" />
          </section>

          <section
            class="rounded-lg border border-red-200 bg-white p-4 sm:p-5 dark:border-red-900/70 dark:bg-gray-900"
            aria-labelledby="settings-danger"
          >
            <h2
              id="settings-danger"
              class="mb-1 text-base font-semibold text-red-700 dark:text-red-400"
            >
              {{ $t('projectSettings.danger') }}
            </h2>
            <p
              v-if="project.isInbox"
              class="text-sm text-gray-500 dark:text-gray-400"
            >
              {{ $t('projectSettings.inboxProtected') }}
            </p>
            <div
              v-else
              class="flex flex-wrap items-center justify-between gap-3"
            >
              <p class="max-w-lg text-sm text-gray-600 dark:text-gray-300">
                {{ $t('projectSettings.deleteBody') }}
              </p>
              <button
                type="button"
                class="btn-danger"
                :disabled="deleting"
                @click="remove"
              >
                <Icon
                  name="trash"
                  class="size-4"
                />
                {{ $t('projectSettings.deleteTitle') }}
              </button>
            </div>
          </section>
        </template>
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
import type { ProjectDetailDto, ProjectLinkDto } from '#shared/types/dto'

const route = useRoute()
const { t } = useI18n()
const toast = useToast()
const apiError = useApiError()
const { ask } = useConfirm()
const projectsStore = useProjectsStore()

const slug = computed(() => String(route.params.slug))
const { project, pending, error, setProject, ready } = useProject(slug)
// Unknown projects render an in-page message but still answer with the real HTTP status (like the public pages).
await useSsrStatus(ready, () => apiError.status(error.value))

usePageTitle(() => (project.value ? `${project.value.name} · ${t('project.tabs.settings')}` : null))

async function onSaved(saved: ProjectDetailDto) {
  if (saved.slug !== slug.value) {
    await navigateTo(`/projects/${saved.slug}/settings`, { replace: true })
    return
  }
  setProject(saved)
}

function onConflict(current: ProjectDetailDto | null) {
  if (current) setProject(current)
}

function onLinksSaved(links: ProjectLinkDto[]) {
  if (project.value) project.value = { ...project.value, links }
}

const deleting = ref(false)

async function remove() {
  const current = project.value
  if (!current) return
  const ok = await ask({
    title: t('projectSettings.deleteConfirm', { name: current.name }),
    message: t('projectSettings.deleteBody'),
    confirmLabel: t('ui.delete'),
    danger: true,
  })
  if (!ok) return
  deleting.value = true
  try {
    await apiFetch<{ ok: true }>(`/api/projects/${encodeURIComponent(current.slug)}`, { method: 'DELETE' })
    projectsStore.remove(current.id)
    toast.success(t('projectSettings.deleted'))
    await navigateTo('/projects', { replace: true })
  }
  catch (err) {
    toast.error(apiError.message(err))
  }
  finally {
    deleting.value = false
  }
}
</script>
