import { describe, expect, it } from 'vitest'
import { useConfirm } from '../useConfirm'

describe('useConfirm', () => {
  it('resolves true on confirm', async () => {
    const dialog = useConfirm()
    const answer = dialog.ask({ title: 'Delete?', danger: true })
    expect(dialog.current.value?.title).toBe('Delete?')
    expect(dialog.current.value?.danger).toBe(true)
    dialog.confirm()
    await expect(answer).resolves.toBe(true)
    expect(dialog.current.value).toBeNull()
  })

  it('resolves false on cancel', async () => {
    const dialog = useConfirm()
    const answer = dialog.ask({ title: 'Sure?' })
    dialog.cancel()
    await expect(answer).resolves.toBe(false)
  })

  it('cancels a pending request when a new one opens', async () => {
    const dialog = useConfirm()
    const first = dialog.ask({ title: 'first' })
    const second = dialog.ask({ title: 'second' })
    await expect(first).resolves.toBe(false)
    expect(dialog.current.value?.title).toBe('second')
    dialog.confirm()
    await expect(second).resolves.toBe(true)
  })
})
