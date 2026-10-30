// Global toast queue rendered by <AppToasts /> in the layouts. Client-side only (no-op during SSR).

export type ToastKind = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

const DEFAULT_DURATION: Record<ToastKind, number> = { success: 3500, info: 4000, error: 7000 }
const MAX_TOASTS = 5

const toasts = ref<Toast[]>([])
const timers = new Map<number, ReturnType<typeof setTimeout>>()
let nextId = 1

function dismiss(id: number) {
  const timer = timers.get(id)
  if (timer) clearTimeout(timer)
  timers.delete(id)
  toasts.value = toasts.value.filter(t => t.id !== id)
}

function push(kind: ToastKind, message: string, duration = DEFAULT_DURATION[kind]): number {
  if (!import.meta.client || !message) return 0
  const id = nextId++
  toasts.value = [...toasts.value, { id, kind, message }]
  while (toasts.value.length > MAX_TOASTS) dismiss(toasts.value[0]!.id)
  if (duration > 0) timers.set(id, setTimeout(() => dismiss(id), duration))
  return id
}

function clear() {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
  toasts.value = []
}

/** Copies text to the clipboard and reports the result with a toast. Resolves true on success. */
export function useCopy() {
  const { t } = useI18n()
  async function copy(text: string, successMessage?: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text)
      push('success', successMessage ?? t('ui.copied'), 2000)
      return true
    }
    catch {
      push('error', t('ui.copyFailed'))
      return false
    }
  }
  return { copy }
}

export function useToast() {
  return {
    toasts: readonly(toasts),
    success: (message: string, duration?: number) => push('success', message, duration),
    error: (message: string, duration?: number) => push('error', message, duration),
    info: (message: string, duration?: number) => push('info', message, duration),
    dismiss,
    clear,
  }
}
