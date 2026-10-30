import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import type { SyncDto } from '#shared/types/dto'
import { useAutoRefresh } from '../useAutoRefresh'

let visibility: DocumentVisibilityState = 'visible'

function setVisibility(state: DocumentVisibilityState) {
  visibility = state
  document.dispatchEvent(new Event('visibilitychange'))
}

async function flush() {
  // Let pending promise callbacks (fetch -> refresh) run.
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe('useAutoRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    visibility = 'visible'
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function setup(responses: Array<string | null>, paused = ref(false)) {
    let call = 0
    const fetchSync = vi.fn(async (_project: string | null): Promise<SyncDto> => {
      const value = responses[Math.min(call, responses.length - 1)] ?? null
      call++
      return { lastChange: value }
    })
    const refresh = vi.fn()
    const scope = effectScope()
    const api = scope.run(() => useAutoRefresh({ project: 'abc', refresh, paused, fetchSync, interval: 15_000 }))!
    return { fetchSync, refresh, scope, api }
  }

  it('takes a baseline first and refreshes only when lastChange changes', async () => {
    const { fetchSync, refresh, scope } = setup(['t1', 't1', 't2', 't2', 't3'])
    await flush()
    expect(fetchSync).toHaveBeenCalledTimes(1)
    expect(fetchSync).toHaveBeenCalledWith('abc')
    expect(refresh).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(15_000) // t1 -> same
    expect(fetchSync).toHaveBeenCalledTimes(2)
    expect(refresh).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(15_000) // t2 -> changed
    expect(refresh).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(15_000) // t2 -> same
    expect(refresh).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(15_000) // t3 -> changed
    expect(refresh).toHaveBeenCalledTimes(2)
    scope.stop()
  })

  it('does not poll while the tab is hidden and checks again when it becomes visible', async () => {
    const { fetchSync, refresh, scope } = setup(['t1', 't2'])
    await flush()
    expect(fetchSync).toHaveBeenCalledTimes(1)

    setVisibility('hidden')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchSync).toHaveBeenCalledTimes(1)

    setVisibility('visible')
    await flush()
    expect(fetchSync).toHaveBeenCalledTimes(2)
    expect(refresh).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('checks on window focus', async () => {
    const { fetchSync, scope } = setup(['t1'])
    await flush()
    window.dispatchEvent(new Event('focus'))
    await flush()
    expect(fetchSync).toHaveBeenCalledTimes(2)
    scope.stop()
  })

  it('skips checks while paused', async () => {
    const paused = ref(false)
    const { fetchSync, refresh, scope } = setup(['t1', 't2'], paused)
    await flush()
    paused.value = true
    await vi.advanceTimersByTimeAsync(45_000)
    expect(fetchSync).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
    paused.value = false
    await vi.advanceTimersByTimeAsync(15_000)
    expect(fetchSync).toHaveBeenCalledTimes(2)
    expect(refresh).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('stops polling when the scope is disposed', async () => {
    const { fetchSync, scope } = setup(['t1', 't2'])
    await flush()
    scope.stop()
    await vi.advanceTimersByTimeAsync(60_000)
    window.dispatchEvent(new Event('focus'))
    await flush()
    expect(fetchSync).toHaveBeenCalledTimes(1)
  })
})
