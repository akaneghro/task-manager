import type { ProjectDetailDto } from '#shared/types/dto'

/** One project (ProjectDetailDto) by slug, reactive to the slug. */
export function useProject(slug: MaybeRefOrGetter<string>) {
  const { data, pending, error, refresh, status } = useFetch<ProjectDetailDto>(
    () => `/api/projects/${encodeURIComponent(toValue(slug))}`,
    { key: computed(() => `tm:project:${toValue(slug)}`) },
  )

  /** Replaces the cached project (e.g. after PATCH) and syncs the sidebar store. */
  function setProject(project: ProjectDetailDto) {
    data.value = project
    useProjectsStore().upsert(project)
  }

  return { project: data, pending, error, refresh, status, setProject }
}
