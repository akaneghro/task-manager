import { defineStore } from 'pinia'
import type { ProjectSummaryDto } from '#shared/types/dto'

/** Projects visible to the current user (incl. archived), used by the sidebar and pickers. */
export const useProjectsStore = defineStore('projects', () => {
  const items = ref<ProjectSummaryDto[]>([])
  const loaded = ref(false)

  function setItems(list: ProjectSummaryDto[]) {
    items.value = list
    loaded.value = true
  }

  /** Inserts or replaces a project (matched by id). Accepts a ProjectDetailDto too. */
  function upsert(project: ProjectSummaryDto) {
    const summary: ProjectSummaryDto = {
      id: project.id,
      slug: project.slug,
      key: project.key,
      name: project.name,
      description: project.description,
      status: project.status,
      client: project.client,
      color: project.color,
      isInbox: project.isInbox,
      version: project.version,
      counts: project.counts,
      openCount: project.openCount,
      updatedAt: project.updatedAt,
      capabilities: project.capabilities,
    }
    const index = items.value.findIndex(p => p.id === project.id)
    if (index === -1) items.value = [...items.value, summary]
    else items.value = items.value.map((p, i) => (i === index ? summary : p))
  }

  function remove(id: string) {
    items.value = items.value.filter(p => p.id !== id)
  }

  function reset() {
    items.value = []
    loaded.value = false
  }

  const inbox = computed(() => items.value.find(p => p.isInbox) ?? null)

  function findBySlug(slug: string): ProjectSummaryDto | null {
    return items.value.find(p => p.slug === slug) ?? null
  }

  return { items, loaded, inbox, setItems, upsert, remove, reset, findBySlug }
})
