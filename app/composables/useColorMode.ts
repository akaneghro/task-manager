const COLOR_MODE_KEY = 'task-manager-color-mode'

export type ColorMode = 'light' | 'dark'

const colorMode = ref<ColorMode>('light')
let initialized = false

export function useColorMode() {
  // Initialize from localStorage on first use
  if (import.meta.client && !initialized) {
    initialized = true
    const stored = localStorage.getItem(COLOR_MODE_KEY)
    if (stored === 'dark' || stored === 'light') {
      colorMode.value = stored
    }
    else {
      // Check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      colorMode.value = prefersDark ? 'dark' : 'light'
    }

    // Apply to document
    updateDocumentClass(colorMode.value)
  }

  function updateDocumentClass(mode: ColorMode) {
    if (import.meta.client) {
      if (mode === 'dark') {
        document.documentElement.classList.add('dark')
      }
      else {
        document.documentElement.classList.remove('dark')
      }
    }
  }

  function toggle() {
    colorMode.value = colorMode.value === 'dark' ? 'light' : 'dark'
    if (import.meta.client) {
      localStorage.setItem(COLOR_MODE_KEY, colorMode.value)
      updateDocumentClass(colorMode.value)
    }
  }

  function set(mode: ColorMode) {
    colorMode.value = mode
    if (import.meta.client) {
      localStorage.setItem(COLOR_MODE_KEY, mode)
      updateDocumentClass(mode)
    }
  }

  // Return reactive object that Vue can unwrap in templates
  return reactive({
    get value() {
      return colorMode.value
    },
    toggle,
    set,
  })
}
