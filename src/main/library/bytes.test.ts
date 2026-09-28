import { describe, expect, it } from 'vitest'
import { ownCopy } from './bytes'

describe('ownCopy', () => {
  it('copies a view of a Buffer into a buffer of its own', () => {
    const big = Buffer.alloc(1000, 7)
    const view = big.subarray(10, 20)
    // what the old code did: still a view of all 1000 bytes
    expect(view.slice().buffer.byteLength).toBeGreaterThanOrEqual(1000)
    const c = ownCopy(view)
    expect(c.buffer.byteLength).toBe(10)
    expect(c.byteOffset).toBe(0)
    expect([...c]).toEqual(new Array(10).fill(7))
    big[10] = 1
    expect(c[0]).toBe(7)
  })
})
