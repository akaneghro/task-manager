// Shared "current time" for relative dates ("5 minutes ago") and "today" checks.
// The server's timestamp travels in the payload (useState), so SSR and hydration render the same text;
// after mount it is refreshed and then ticks every 30 s, which also keeps relative labels fresh.

export const NOW_TICK_MS = 30_000

let timer: ReturnType<typeof setInterval> | null = null
let subscribers = 0

export function useNow(): ComputedRef<Date> {
  const now = useState<number>('tm:now', () => Date.now())

  if (import.meta.client && getCurrentInstance()) {
    onMounted(() => {
      subscribers++
      now.value = Date.now()
      timer ??= setInterval(() => {
        now.value = Date.now()
      }, NOW_TICK_MS)
    })
    onBeforeUnmount(() => {
      subscribers = Math.max(0, subscribers - 1)
      if (subscribers === 0 && timer) {
        clearInterval(timer)
        timer = null
      }
    })
  }

  return computed(() => new Date(now.value))
}
