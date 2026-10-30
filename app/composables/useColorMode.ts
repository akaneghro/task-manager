// Light/dark mode. An explicit choice is kept in a cookie (so SSR renders the right toggle state and avoids a
// hydration mismatch) and mirrored to localStorage (read by the pre-paint script in app.vue). Without an explicit
// choice the system preference is applied after mount.

const COLOR_MODE_KEY = 'task-manager-color-mode'
export const COLOR_MODE_COOKIE = 'tm_color_mode'

export type ColorMode = 'light' | 'dark'

function isColorMode(value: unknown): value is ColorMode {
  return value === 'light' || value === 'dark'
}

function applyDocumentClass(mode: ColorMode) {
  if (import.meta.client) document.documentElement.classList.toggle('dark', mode === 'dark')
}

function readStoredMode(): ColorMode | null {
  try {
    const stored = localStorage.getItem(COLOR_MODE_KEY)
    return isColorMode(stored) ? stored : null
  }
  catch {
    return null
  }
}

export function useColorMode() {
  const cookie = useCookie<string | null>(COLOR_MODE_COOKIE, {
    default: () => null,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  const mode = useState<ColorMode>('tm:color-mode', () => (isColorMode(cookie.value) ? cookie.value : 'light'))
  // Whether the mode is the user's choice (cookie/localStorage) rather than the system preference.
  const explicit = useState<boolean>('tm:color-mode-explicit', () => isColorMode(cookie.value))

  if (import.meta.client && getCurrentInstance()) {
    onMounted(() => {
      if (!isColorMode(cookie.value)) {
        const stored = readStoredMode()
        if (stored) {
          cookie.value = stored
          explicit.value = true
        }
        mode.value = stored ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      }
      applyDocumentClass(mode.value)
    })
  }

  function set(next: ColorMode) {
    mode.value = next
    explicit.value = true
    cookie.value = next
    if (import.meta.client) {
      try {
        localStorage.setItem(COLOR_MODE_KEY, next)
      }
      catch {
        // Storage may be unavailable (private mode); the cookie still keeps the choice.
      }
      applyDocumentClass(next)
    }
  }

  function toggle() {
    set(mode.value === 'dark' ? 'light' : 'dark')
  }

  // Reactive object so templates can read `colorMode.value` without `.value.value`.
  return reactive({
    get value() {
      return mode.value
    },
    get explicit() {
      return explicit.value
    },
    toggle,
    set,
  })
}
