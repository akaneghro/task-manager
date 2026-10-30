import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { isTypingTarget, shortcutFor, useShortcuts } from '../useShortcuts'

function key(key: string, target: EventTarget | null = document.body, mods: Partial<KeyboardEvent> = {}) {
  return { key, target, ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false, ...mods }
}

describe('useShortcuts', () => {
  it('maps keys to handlers', () => {
    expect(shortcutFor(key('n'))).toBe('onNew')
    expect(shortcutFor(key('/'))).toBe('onSearch')
    expect(shortcutFor(key('Escape'))).toBe('onEscape')
    expect(shortcutFor(key('x'))).toBeNull()
    expect(shortcutFor(key('n', document.body, { ctrlKey: true }))).toBeNull()
  })

  it('ignores keys typed in inputs', () => {
    const input = document.createElement('input')
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    const textarea = document.createElement('textarea')
    expect(isTypingTarget(input)).toBe(true)
    expect(isTypingTarget(textarea)).toBe(true)
    expect(isTypingTarget(checkbox)).toBe(false)
    expect(isTypingTarget(document.body)).toBe(false)
    expect(shortcutFor(key('n', input))).toBeNull()
  })

  it('calls the handler on window keydown until disposed', () => {
    const onNew = vi.fn()
    const scope = effectScope()
    scope.run(() => useShortcuts({ onNew }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }))
    expect(onNew).toHaveBeenCalledTimes(1)
    scope.stop()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }))
    expect(onNew).toHaveBeenCalledTimes(1)
  })
})
