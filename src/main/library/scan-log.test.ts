import { describe, expect, it } from 'vitest'
import { scanLogLine } from './scan-log'

describe('scanLogLine', () => {
  it('names the time of each phase that finished', () => {
    expect(scanLogLine(900, [100, 300, 500], 12, 40, 3)).toBe(
      'Library scan: 900 ms (listing 100, sizes and images 300, tags 500), ' +
        '12 files read, 40 songs in 3 albums'
    )
    expect(scanLogLine(120, [120], 0, 40, 3)).toBe(
      'Library scan: 120 ms (listing 120), 0 files read, 40 songs in 3 albums'
    )
  })

  it('has no empty brackets when no phase finished', () => {
    expect(scanLogLine(5, [], 0, 0, 0)).toBe(
      'Library scan: 5 ms, 0 files read, 0 songs in 0 albums'
    )
  })
})
