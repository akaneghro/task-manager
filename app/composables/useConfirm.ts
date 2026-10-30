// Promise-based confirmation dialog rendered by <ConfirmDialog /> in the layouts.

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (value: boolean) => void
}

const current = shallowRef<ConfirmRequest | null>(null)

function settle(value: boolean) {
  const request = current.value
  if (!request) return
  current.value = null
  request.resolve(value)
}

/** Opens the dialog; resolves `true` on confirm, `false` on cancel/Escape. A new request cancels the previous one. */
function ask(options: ConfirmOptions): Promise<boolean> {
  if (!import.meta.client) return Promise.resolve(false)
  settle(false)
  return new Promise<boolean>((resolve) => {
    current.value = { ...options, resolve }
  })
}

export function useConfirm() {
  return {
    current: readonly(current),
    ask,
    confirm: () => settle(true),
    cancel: () => settle(false),
  }
}
