// Keeps keyboard focus inside a modal panel (drawer, dialog, mobile nav) while it is open:
// Tab / Shift+Tab wrap between the first and last focusable elements, and focus that escapes the panel
// (e.g. a click on the page behind) is pulled back on the next Tab.

import { onScopeDispose, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

/** Focusable, visible elements of `root` in DOM order. Pure-ish, exported for tests. */
export function focusableElements(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
    .filter(el => !el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true' && !el.closest('[inert]'))
}

/**
 * Where Tab should move focus inside `root`, or null to let the browser handle it. Exported for tests.
 * `active` is the currently focused element.
 */
export function trapTarget(root: HTMLElement, active: Element | null, shift: boolean): HTMLElement | null {
  const items = focusableElements(root)
  if (items.length === 0) return root
  const first = items[0]!
  const last = items[items.length - 1]!
  const inside = active !== null && root.contains(active)
  if (!inside) return shift ? last : first
  if (shift && (active === first || active === root)) return last
  if (!shift && active === last) return first
  return null
}

/** Active traps, innermost last: only the top one handles Tab (a confirm dialog opened from the drawer). */
const trapStack: symbol[] = []

export interface FocusTrapOptions {
  /** Move focus into the panel when it opens (first focusable, else the panel). Default false. */
  initialFocus?: boolean
  /** Return focus to the previously focused element when it closes. Default false. */
  restoreFocus?: boolean
}

export function useFocusTrap(
  panel: MaybeRefOrGetter<HTMLElement | null | undefined>,
  active: MaybeRefOrGetter<boolean>,
  options: FocusTrapOptions = {},
) {
  let previous: HTMLElement | null = null
  const id = Symbol('focus-trap')

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Tab' || event.defaultPrevented) return
    if (trapStack[trapStack.length - 1] !== id) return
    const root = toValue(panel)
    if (!root) return
    const target = trapTarget(root, document.activeElement, event.shiftKey)
    if (!target) return
    event.preventDefault()
    target.focus()
  }

  function activate() {
    if (typeof document === 'undefined') return
    previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    trapStack.push(id)
    document.addEventListener('keydown', onKeydown)
    if (options.initialFocus) {
      requestAnimationFrame(() => {
        const root = toValue(panel)
        if (!root || root.contains(document.activeElement)) return
        const first = focusableElements(root)[0]
        ;(first ?? root).focus()
      })
    }
  }

  function release() {
    const index = trapStack.indexOf(id)
    if (index !== -1) trapStack.splice(index, 1)
    if (typeof document !== 'undefined') document.removeEventListener('keydown', onKeydown)
  }

  function deactivate() {
    if (typeof document === 'undefined') return
    release()
    if (options.restoreFocus && previous?.isConnected) previous.focus()
    previous = null
  }

  if (import.meta.client) {
    watch(() => toValue(active), (on, was) => {
      if (on && !was) activate()
      else if (!on && was) deactivate()
    }, { immediate: true })
  }
  onScopeDispose(release)
}
