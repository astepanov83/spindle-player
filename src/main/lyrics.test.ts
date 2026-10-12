import { describe, expect, it } from 'vitest'
import type { Lyrics } from '../shared/lyrics'
import { LyricsService, type LyricsAsk } from './lyrics'

const words = (plain: string): Lyrics => ({ plain })

describe('LyricsService', () => {
  it("asks the song's own plugin by its id, and no other plugin", async () => {
    const s = new LyricsService()
    const asked: string[] = []
    s.providerFor('files').provide(async (id) => (asked.push('files:' + id), words('mine')))
    s.providerFor('mfp').provide(async (id) => (asked.push('mfp:' + id), words('not mine')))
    expect(await s.get({ key: 'files:a:b' })).toEqual(words('mine'))
    expect(asked).toEqual(['files:a:b'])
  })

  it('asks the sources added after only when the plugin has none, in order', async () => {
    const s = new LyricsService()
    const asked: string[] = []
    s.providerFor('files').provide(async (id) => (id === 'has' ? words('local') : undefined))
    s.add(async (a: LyricsAsk) => (asked.push('one ' + a.song?.title), undefined))
    s.add(async () => (asked.push('two'), words('online')))
    const song = { artist: 'A', title: 'T', album: 'B', duration: 9 }
    expect(await s.get({ key: 'files:has', song })).toEqual(words('local'))
    expect(asked).toEqual([])
    expect(await s.get({ key: 'files:none', song })).toEqual(words('online'))
    expect(asked).toEqual(['one T', 'two'])
    // a plugin with no reader of its own
    expect(await s.get({ key: 'radio:x' })).toEqual(words('online'))
  })

  it('gives nothing when no source has words', async () => {
    const s = new LyricsService()
    expect(await s.get({ key: 'files:a' })).toBeUndefined()
    s.providerFor('files').provide(async () => undefined)
    expect(await s.get({ key: 'files:a' })).toBeUndefined()
  })

  it('logs a source that fails and goes on to the next', async () => {
    const logs: string[] = []
    const s = new LyricsService((t) => logs.push(t))
    s.providerFor('files').provide(() => Promise.reject(new Error('disk gone')))
    s.add(async () => words('online'))
    expect(await s.get({ key: 'files:a' })).toEqual(words('online'))
    expect(logs).toEqual(['Lyrics for files:a not read: Error: disk gone'])
  })

  it('stops the song asked before when a new one is asked, and gives it nothing', async () => {
    const s = new LyricsService()
    const signals: AbortSignal[] = []
    let release: (() => void) | undefined
    s.providerFor('files').provide((id, signal) => {
      signals.push(signal)
      if (id !== 'slow') return Promise.resolve(words(id))
      return new Promise((r) => (release = () => r(words('slow'))))
    })
    let laterAsked = false
    s.add(async () => ((laterAsked = true), undefined))
    const first = s.get({ key: 'files:slow' })
    const second = await s.get({ key: 'files:fast' })
    expect(second).toEqual(words('fast'))
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)
    release!()
    expect(await first).toBeUndefined()
    expect(laterAsked).toBe(false)
  })
})
