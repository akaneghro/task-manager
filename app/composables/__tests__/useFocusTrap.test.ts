import { afterEach, describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { focusableElements, trapTarget, useFocusTrap } from '../useFocusTrap'

function panel(html: string): HTMLElement {
  const root = document.createElement('div')
  root.tabIndex = -1
  root.innerHTML = html
  document.body.appendChild(root)
  return root
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('focusableElements / trapTarget', () => {
  it('lists enabled focusable elements in order', () => {
    const root = panel('<button id="a">a</button><button disabled>x</button><input id="b"><a href="#" id="c">c</a><span tabindex="-1">no</span>')
    expect(focusableElements(root).map(el => el.id)).toEqual(['a', 'b', 'c'])
  })

  it('wraps Tab from the last element and Shift+Tab from the first', () => {
    const root = panel('<button id="a">a</button><button id="b">b</button>')
    const [a, b] = focusableElements(root)
    expect(trapTarget(root, b!, false)).toBe(a)
    expect(trapTarget(root, a!, true)).toBe(b)
    expect(trapTarget(root, a!, false)).toBeNull()
    expect(trapTarget(root, root, true)).toBe(b)
  })

  it('pulls focus that escaped the panel back in', () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    const root = panel('<button id="a">a</button><button id="b">b</button>')
    expect(trapTarget(root, outside, false)?.id).toBe('a')
    expect(trapTarget(root, outside, true)?.id).toBe('b')
  })

  it('keeps focus on the panel when it has nothing focusable', () => {
    const root = panel('<p>text</p>')
    expect(trapTarget(root, document.body, false)).toBe(root)
  })
})

describe('useFocusTrap', () => {
  it('only the innermost active trap handles Tab', async () => {
    const outer = panel('<button id="o1">o1</button><button id="o2">o2</button>')
    const inner = panel('<button id="i1">i1</button><button id="i2">i2</button>')
    const outerOpen = ref(true)
    const innerOpen = ref(false)
    const scope = effectScope()
    scope.run(() => {
      useFocusTrap(outer, outerOpen)
      useFocusTrap(inner, innerOpen)
    })
    innerOpen.value = true
    await nextTick()
    ;(inner.querySelector('#i2') as HTMLElement).focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    expect(document.activeElement?.id).toBe('i1')

    innerOpen.value = false
    await nextTick()
    ;(outer.querySelector('#o2') as HTMLElement).focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    expect(document.activeElement?.id).toBe('o1')
    scope.stop()
  })
})
