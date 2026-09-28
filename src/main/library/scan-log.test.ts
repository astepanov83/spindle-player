import { describe, expect, it } from 'vitest'
import { scanLogLine } from './scan-log'

describe('scanLogLine', () => {
  it('names when each phase that finished ended', () => {
    expect(scanLogLine(900, [100, 300, 900], 12, 40, 3, 250)).toBe(
      'Library scan: 900 ms (listed at 100, sizes at 300, tags at 900), ' +
        '12 files read (first sent at 250), 40 songs in 3 albums'
    )
    expect(scanLogLine(120, [120], 0, 40, 3)).toBe(
      'Library scan: 120 ms (listed at 120), 0 files read, 40 songs in 3 albums'
    )
  })

  it('has no empty brackets when no phase finished', () => {
    expect(scanLogLine(5, [], 0, 0, 0)).toBe(
      'Library scan: 5 ms, 0 files read, 0 songs in 0 albums'
    )
  })
})
