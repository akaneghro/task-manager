import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToast } from '../useToast'

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useToast().clear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('pushes toasts of each kind', () => {
    const toast = useToast()
    toast.success('saved')
    toast.error('failed')
    toast.info('fyi')
    expect(toast.toasts.value.map(t => [t.kind, t.message])).toEqual([
      ['success', 'saved'],
      ['error', 'failed'],
      ['info', 'fyi'],
    ])
  })

  it('auto-dismisses after the duration', () => {
    const toast = useToast()
    toast.success('bye', 1000)
    expect(toast.toasts.value).toHaveLength(1)
    vi.advanceTimersByTime(1001)
    expect(toast.toasts.value).toHaveLength(0)
  })

  it('dismisses manually and ignores empty messages', () => {
    const toast = useToast()
    const id = toast.info('x', 0)
    expect(toast.info('')).toBe(0)
    expect(toast.toasts.value).toHaveLength(1)
    toast.dismiss(id)
    expect(toast.toasts.value).toHaveLength(0)
  })

  it('keeps at most 5 toasts', () => {
    const toast = useToast()
    for (let i = 0; i < 8; i++) toast.info(`m${i}`, 0)
    expect(toast.toasts.value.map(t => t.message)).toEqual(['m3', 'm4', 'm5', 'm6', 'm7'])
  })
})
