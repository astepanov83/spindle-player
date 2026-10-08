import { describe, expect, it, vi } from 'vitest'
import type { Grouping } from '../library/groups'

// the stores the tile actions use; runsCache needs none of them
vi.mock('../plugins', () => ({ actOnPage: vi.fn() }))
vi.mock('../stores/queues.svelte', () => ({ queues: {} }))
vi.mock('../stores/song-drag.svelte', () => ({ songDrag: {} }))
vi.mock('../stores/menu.svelte', () => ({ menu: {} }))
vi.mock('../library/song-menu', () => ({ sections: vi.fn(), songMenu: vi.fn() }))

const { runsCache } = await import('./tile-acts')

const byFirst: Grouping<string> = { heading: (x) => ({ key: x[0], title: x[0] }) }

describe('runsCache', () => {
  it("works a list's runs out once, and again for another list", () => {
    const heading = vi.spyOn(byFirst, 'heading')
    const runsOf = runsCache<string>()
    const list = ['a1', 'a2', 'b1']
    const runs = runsOf(list, { grouping: byFirst })
    expect(runs?.map((r) => [r.heading.key, r.start, r.end])).toEqual([
      ['a', 0, 2],
      ['b', 2, 3]
    ])
    expect(runsOf(list, { grouping: byFirst })).toBe(runs)
    expect(heading).toHaveBeenCalledTimes(3)
    expect(runsOf(['c1'], { grouping: byFirst })?.[0].heading.key).toBe('c')
  })

  it('no groups: no runs', () => {
    expect(runsCache<string>()(['a1'], undefined)).toBeUndefined()
  })
})
