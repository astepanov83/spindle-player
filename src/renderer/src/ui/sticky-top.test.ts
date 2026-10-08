import { describe, expect, it } from 'vitest'
import { coveredBy } from './sticky-top'

describe('coveredBy (ticket 102)', () => {
  it('is nothing with no stuck parts', () => expect(coveredBy([])).toBe(0))
  it('is the bottom of the lowest stuck part', () => {
    // column heads stuck at 0, the held heading under them at 38
    const heads = { top: 0, bottom: 38, sticksAt: 0 }
    const held = { top: 38, bottom: 114, sticksAt: 38 }
    expect(coveredBy([heads, held])).toBe(114)
  })
  it('counts a held heading the next one pushes up', () =>
    expect(coveredBy([{ top: 10, bottom: 86, sticksAt: 38 }])).toBe(86))
  it('leaves out heads not stuck yet, lower down the page', () =>
    expect(coveredBy([{ top: 270, bottom: 308, sticksAt: 0 }])).toBe(0))
  it('leaves out a part pushed wholly above the top', () =>
    expect(coveredBy([{ top: -80, bottom: -4, sticksAt: 38 }])).toBe(0))
})
