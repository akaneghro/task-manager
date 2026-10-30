<template>
  <div>
    <div
      v-if="error"
      class="mx-auto max-w-6xl px-4 py-10"
    >
      <EmptyState
        icon="folder"
        :title="$t('project.notFound')"
        :description="apiError.status(error) === 404 ? $t('project.notFoundHint') : apiError.message(error)"
      >
        <NuxtLink
          to="/projects"
          class="btn-secondary"
        >
          {{ $t('nav.projects') }}
        </NuxtLink>
      </EmptyState>
    </div>

    <template v-else-if="project">
      <ProjectHeader :project="project" />

      <div class="mx-auto grid max-w-6xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_18rem]">
        <div class="min-w-0 space-y-5">
          <section
            class="card p-4"
            aria-labelledby="project-description"
          >
            <h2
              id="project-description"
              class="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100"
            >
              {{ $t('project.description') }}
            </h2>
            <p
              v-if="project.description"
              class="text-sm whitespace-pre-line text-gray-700 dark:text-gray-300"
            >
              {{ project.description }}
            </p>
            <p
              v-else
              class="text-sm text-gray-400 dark:text-gray-500"
            >
              {{ $t('project.noDescription') }}
            </p>
          </section>

          <section
            class="card p-4"
            aria-labelledby="project-notes"
          >
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2
                id="project-notes"
                class="text-sm font-semibold text-gray-900 dark:text-gray-100"
              >
                {{ $t('project.notes') }}
              </h2>
              <button
                v-if="canEditNotes && !editing"
                type="button"
                class="btn-ghost px-2 py-1 text-xs"
                @click="startEditing"
              >
                <Icon
                  name="pencil"
                  class="size-3.5"
                />
                {{ $t('project.editNotes') }}
              </button>
            </div>

            <div
              v-if="conflictMessage"
              role="alert"
              class="mb-3 flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100"
            >
              <Icon
                name="alert"
                class="mt-0.5 size-4 shrink-0"
              />
              <span>{{ conflictMessage }}</span>
            </div>

            <template v-if="editing">
              <MarkdownEditor
                v-model="draft"
                :rows="14"
                :aria-label="$t('project.notes')"
                :placeholder="$t('project.notesPlaceholder')"
                @submit="saveNotes"
              />
              <details
                v-if="conflictMessage"
                class="mt-3 rounded-md border border-gray-200 p-3 dark:border-gray-800"
                open
              >
                <summary class="cursor-pointer text-xs font-medium text-gray-600 dark:text-gray-300">
                  {{ $t('project.notes') }} ({{ formatRelative(project.updatedAt, locale, now) }})
                </summary>
                <MarkdownView
                  class="mt-2"
                  :source="project.notes"
                />
              </details>
              <div class="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  class="btn-secondary"
                  @click="cancelEditing"
                >
                  {{ $t('ui.cancel') }}
                </button>
                <button
                  type="button"
                  class="btn-primary"
                  :disabled="saving"
                  @click="saveNotes"
                >
                  {{ saving ? $t('ui.saving') : $t('ui.save') }}
                </button>
              </div>
            </template>
            <template v-else>
              <MarkdownView
                v-if="project.notes"
                :source="project.notes"
              />
              <p
                v-else
                class="text-sm text-gray-400 dark:text-gray-500"
              >
                {{ $t('project.noNotes') }}
              </p>
            </template>
          </section>
        </div>

        <aside class="space-y-5">
          <section
            class="card p-4"
            aria-labelledby="project-counts"
          >
            <div class="mb-3 flex items-center justify-between">
              <h2
                id="project-counts"
                class="text-sm font-semibold text-gray-900 dark:text-gray-100"
              >
                {{ $t('project.tasksByStatus') }}
              </h2>
              <span class="text-xs text-gray-500 dark:text-gray-400">{{ $t('project.openTasks', { n: project.openCount }, project.openCount) }}</span>
            </div>
            <ul class="space-y-1">
              <li
                v-for="status in TASK_STATUSES"
                :key="status"
              >
                <NuxtLink
                  :to="{ path: `/projects/${project.slug}/tasks`, query: { status } }"
                  class="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <span class="text-gray-600 dark:text-gray-300">{{ $t(`statusCounts.${status}`) }}</span>
                  <span
                    class="tabular-nums"
                    :class="project.counts[status] > 0 ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-600'"
                  >{{ project.counts[status] }}</span>
                </NuxtLink>
              </li>
            </ul>
            <NuxtLink
              :to="`/projects/${project.slug}/tasks`"
              class="btn-secondary mt-3 w-full"
            >
              {{ $t('project.viewTasks') }}
              <Icon
                name="arrow-right"
                class="size-4"
              />
            </NuxtLink>
          </section>

          <section
            class="card p-4"
            aria-labelledby="project-links"
          >
            <h2
              id="project-links"
              class="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100"
            >
              {{ $t('project.links') }}
            </h2>
            <ul
              v-if="project.links.length > 0"
              class="space-y-1.5"
            >
              <li
                v-for="link in sortedLinks"
                :key="link.id"
              >
                <a
                  :href="link.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex items-center gap-2 text-sm text-primary-700 hover:underline dark:text-primary-400"
                >
                  <Icon
                    :name="link.kind === 'repo' ? 'github' : 'link'"
                    class="size-4 shrink-0 text-gray-400"
                  />
                  <span class="truncate">{{ link.label }}</span>
                  <span class="ml-auto shrink-0 text-[11px] text-gray-400 dark:text-gray-500">{{ $t(`linkKind.${link.kind}`) }}</span>
                </a>
              </li>
            </ul>
            <p
              v-else
              class="text-sm text-gray-400 dark:text-gray-500"
            >
              {{ $t('project.noLinks') }}
            </p>
          </section>

          <p class="px-1 text-xs text-gray-400 dark:text-gray-500">
            {{ $t('project.updated', { when: formatRelative(project.updatedAt, locale, now) }) }}
          </p>
        </aside>
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
import type { ProjectDetailDto } from '#shared/types/dto'
import { TASK_STATUSES } from '#shared/utils/enums'

const route = useRoute()
const { t, locale } = useI18n()
const now = useNow()
const toast = useToast()
const apiError = useApiError()

const slug = computed(() => String(route.params.slug))
const { project, pending, error, setProject } = useProject(slug)

usePageTitle(() => project.value?.name)

const sortedLinks = computed(() => [...(project.value?.links ?? [])].sort((a, b) => a.position - b.position))
const canEditNotes = computed(() => project.value?.capabilities?.edit === true)

const editing = ref(false)
const draft = ref('')
const saving = ref(false)
const conflictMessage = ref<string | null>(null)

function startEditing() {
  draft.value = project.value?.notes ?? ''
  conflictMessage.value = null
  editing.value = true
}

function cancelEditing() {
  editing.value = false
  conflictMessage.value = null
}

function isProjectDetail(value: unknown): value is ProjectDetailDto {
  return typeof value === 'object' && value !== null && 'notes' in value && 'version' in value && 'slug' in value
}

async function saveNotes() {
  const current = project.value
  if (!current || saving.value) return
  saving.value = true
  try {
    const updated = await apiFetch<ProjectDetailDto>(`/api/projects/${encodeURIComponent(current.slug)}`, {
      method: 'PATCH',
      body: { expectedVersion: current.version, notes: draft.value },
    })
    setProject(updated)
    editing.value = false
    conflictMessage.value = null
    toast.success(t('project.notesSaved'))
  }
  catch (err) {
    if (apiError.isConflict(err)) {
      const latest = apiError.details(err)
      if (isProjectDetail(latest)) setProject(latest)
      else await refreshNuxtData(`tm:project:${current.slug}`)
      conflictMessage.value = t('project.notesConflict')
    }
    else {
      toast.error(apiError.message(err))
    }
  }
  finally {
    saving.value = false
  }
}

onBeforeRouteLeave(() => {
  editing.value = false
})
</script>
