import type { Pinia } from 'pinia'
import type { NuxtApp } from '#app'
import type { ProjectSummaryDto } from '#shared/types/dto'
import type { ProjectStatus } from '#shared/utils/enums'

/** Order of the status groups in the sidebar / projects page. `archived` is shown collapsed at the end. */
export const PROJECT_STATUS_ORDER: readonly ProjectStatus[] = ['development', 'production', 'maintenance', 'idea', 'paused', 'archived']

export type ProjectGroups = Record<ProjectStatus, ProjectSummaryDto[]>

/** Groups projects by status (Inbox excluded), each group sorted by name. */
export function groupProjectsByStatus(projects: readonly ProjectSummaryDto[]): ProjectGroups {
  const groups: ProjectGroups = { idea: [], development: [], production: [], maintenance: [], paused: [], archived: [] }
  for (const project of projects) {
    if (project.isInbox) continue
    groups[project.status].push(project)
  }
  for (const status of PROJECT_STATUS_ORDER) {
    groups[status].sort((a, b) => a.name.localeCompare(b.name))
  }
  return groups
}

const PROJECTS_QUERY = { includeArchived: 'true' } as const

/** Stable handler shared by every useProjects() caller (same key => same handler). Forwards cookies during SSR. */
async function loadProjectsOnce(nuxtApp: NuxtApp): Promise<true> {
  const store = useProjectsStore(nuxtApp.$pinia as Pinia)
  if (!store.loaded) {
    const requestFetch = await nuxtApp.runWithContext(() => useRequestFetch())
    store.setItems(await requestFetch<ProjectSummaryDto[]>('/api/projects', { query: PROJECTS_QUERY }))
  }
  return true
}

/** Projects list shared by the sidebar and pages (Pinia store + SSR-friendly first load). */
export function useProjects() {
  const store = useProjectsStore()

  /** Re-fetches the list (call after creating/updating/deleting a project). */
  async function refresh() {
    store.setItems(await $fetch<ProjectSummaryDto[]>('/api/projects', { query: PROJECTS_QUERY }))
  }

  const { pending, error } = useAsyncData('tm:projects', loadProjectsOnce)

  const projects = computed(() => store.items)
  const inbox = computed(() => store.inbox)
  const groups = computed(() => groupProjectsByStatus(store.items))

  return {
    projects,
    inbox,
    groups,
    pending,
    error,
    refresh,
    upsert: store.upsert,
    remove: store.remove,
    findBySlug: store.findBySlug,
  }
}
