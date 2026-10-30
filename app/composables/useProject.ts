import type { ProjectDetailDto } from '#shared/types/dto'

export function projectDataKey(slug: string): string {
  return `tm:project:${slug}`
}

/** One project (ProjectDetailDto) by slug, reactive to the slug. */
export function useProject(slug: MaybeRefOrGetter<string>) {
  const request = useFetch<ProjectDetailDto>(
    () => `/api/projects/${encodeURIComponent(toValue(slug))}`,
    { key: computed(() => projectDataKey(toValue(slug))) },
  )
  const { data, pending, error, refresh, status } = request

  /** Replaces the cached project (e.g. after PATCH) and syncs the sidebar store. */
  function setProject(project: ProjectDetailDto) {
    data.value = project
    useProjectsStore().upsert(project)
  }

  /** Resolves once the first load settled (await it during SSR to answer with the real HTTP status). */
  const ready = (async () => {
    await request
  })()

  return { project: data, pending, error, refresh, status, setProject, ready }
}
