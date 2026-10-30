// Global keyboard shortcuts of the tasks pages: `n` quick add, `/` focus search, `Esc` close drawer.
// Ignored while the user types in an input, textarea, select or contenteditable element.

import { getCurrentInstance, getCurrentScope, onMounted, onScopeDispose } from 'vue'

export interface ShortcutHandlers {
  onNew?: () => void
  onSearch?: () => void
  onEscape?: () => void
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Partial<HTMLElement>).tagName !== 'string') return false
  const element = target as HTMLElement
  const tag = element.tagName.toLowerCase()
  if (tag === 'textarea' || tag === 'select') return true
  if (tag === 'input') {
    const type = (element as HTMLInputElement).type
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(type)
  }
  return element.isContentEditable === true
}

/** Which handler a keydown maps to, or null. Pure, exported for tests. */
export function shortcutFor(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'target' | 'defaultPrevented'>): keyof ShortcutHandlers | null {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return null
  if (isTypingTarget(event.target)) return null
  if (event.key === 'n' || event.key === 'N') return 'onNew'
  if (event.key === '/') return 'onSearch'
  if (event.key === 'Escape') return 'onEscape'
  return null
}

export function useShortcuts(handlers: ShortcutHandlers) {
  function onKeydown(event: KeyboardEvent) {
    const name = shortcutFor(event)
    if (!name) return
    const handler = handlers[name]
    if (!handler) return
    event.preventDefault()
    handler()
  }

  function start() {
    window.addEventListener('keydown', onKeydown)
  }

  function stop() {
    if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeydown)
  }

  if (import.meta.client) {
    if (getCurrentInstance()) onMounted(start)
    else start()
  }
  if (getCurrentScope()) onScopeDispose(stop)

  return { stop }
}
