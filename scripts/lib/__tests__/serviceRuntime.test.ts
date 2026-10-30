import { describe, expect, it } from 'vitest'
import { backoffDelay, MAX_LOG_BYTES, shouldRotate } from '../serviceRuntime.mjs'

describe('service runtime helpers', () => {
  it('backs off exponentially and caps at one minute', () => {
    expect(backoffDelay(0)).toBe(1000)
    expect(backoffDelay(1)).toBe(2000)
    expect(backoffDelay(5)).toBe(32_000)
    expect(backoffDelay(6)).toBe(60_000)
    expect(backoffDelay(50)).toBe(60_000)
    expect(backoffDelay(-3)).toBe(1000)
  })

  it('rotates the log only above the size limit', () => {
    expect(shouldRotate(MAX_LOG_BYTES)).toBe(false)
    expect(shouldRotate(MAX_LOG_BYTES + 1)).toBe(true)
  })
})
