// Title shown in <AppTopBar /> (and the document title). Call from pages: usePageTitle(() => project.value?.name).
// The title is bound to the route path that set it, so stale titles never leak into the next page.

interface PageTitleState {
  path: string
  title: string
}

export function usePageTitle(title?: MaybeRefOrGetter<string | null | undefined>) {
  const route = useRoute()
  const state = useState<PageTitleState | null>('tm:page-title', () => null)

  if (title !== undefined) {
    const path = route.path
    watch(() => toValue(title), (value) => {
      state.value = value ? { path, title: value } : null
    }, { immediate: true })
    useHead({ title: () => {
      const value = toValue(title)
      return value ? `${value} · Task Manager` : 'Task Manager'
    } })
  }

  /** Title for the current route, or null. */
  return computed(() => (state.value && state.value.path === route.path ? state.value.title : null))
}
