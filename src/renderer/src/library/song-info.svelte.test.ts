import { describe, expect, it, vi } from 'vitest'
import type { SongInfoView } from '../plugins/types'
import { plugins } from '../../../shared/plugins'

// any plugin's keys: the core names none (ticket 064)
const p = plugins[0].id

const fake = vi.hoisted(() => ({
  answers: new Map<string, (v: unknown) => void>()
}))

vi.mock('../plugins', () => ({
  songInfoOf: (key: string) =>
    key.endsWith(':none')
      ? undefined
      : {
          now: { title: `${key} now`, sections: [] },
          full: new Promise((r) => fake.answers.set(key, r))
        }
}))

const { songInfo } = await import('./song-info.svelte')
const { songKeyOf } = await import('./song-info-key')

const full = (key: string): SongInfoView => ({ title: `${key} full`, sections: [] })
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('the song info panel', () => {
  it('shows what is known at once, then the file once read', async () => {
    songInfo.open(`${p}:a`)
    expect(songInfo.view?.title).toBe(`${p}:a now`)
    expect(songInfo.reading).toBe(true)
    fake.answers.get(`${p}:a`)!(full(`${p}:a`))
    await tick()
    expect(songInfo.view?.title).toBe(`${p}:a full`)
    expect(songInfo.reading).toBe(false)
  })

  it('drops a read that comes after another song or a close', async () => {
    songInfo.open(`${p}:b`)
    songInfo.open(`${p}:c`)
    fake.answers.get(`${p}:b`)!(full(`${p}:b`))
    await tick()
    expect(songInfo.view?.title).toBe(`${p}:c now`)
    songInfo.close()
    fake.answers.get(`${p}:c`)!(full(`${p}:c`))
    await tick()
    expect(songInfo.view).toBeNull()
  })

  it('opens nothing for an item with no panel', () => {
    songInfo.open(`${p}:none`)
    expect(songInfo.view).toBeNull()
  })
})

describe('songKeyOf', () => {
  const at = (key: string | undefined): Element =>
    ({
      closest: () => (key === undefined ? null : { dataset: { songKey: key } })
    }) as unknown as Element

  it("gives the focused row's song", () => {
    expect(songKeyOf(at(`${p}:a`))).toBe(`${p}:a`)
    expect(songKeyOf(at(undefined))).toBeUndefined()
    expect(songKeyOf(at('nonsense'))).toBeUndefined()
    expect(songKeyOf(null)).toBeUndefined()
  })
})
