import { describe, expect, it, vi } from 'vitest'
import { fallbackPalettes } from '../../shared/palette'
import { mergeStreams, type Station, type Stream } from '../../shared/stations'
import { PlayedStations, type SavedStationsLike } from './play'

const s128: Stream = { url: 'https://a.example/128', bitrate: 128, codec: 'mp3' }
const s320: Stream = { url: 'https://a.example/320', bitrate: 320, codec: 'mp3' }

const st = (id: string, streams: Stream[] = [s128], more: Partial<Station> = {}): Station => ({
  id,
  name: id,
  tags: [],
  streams,
  ...more
})

// A stations store with only what radio:play needs.
function saved(list: Station[]): SavedStationsLike & { list: Station[] } {
  return {
    list,
    get(id) {
      return this.list.find((s) => s.id === id)
    },
    addStreams(id, found) {
      this.list = this.list.map((s) =>
        s.id === id ? { ...s, streams: mergeStreams(s.streams, found) } : s
      )
      return this.list
    }
  }
}

// A find that answers when the test says so.
function finder(): {
  find: (s: Pick<Station, 'pls' | 'streams'>) => Promise<Stream[]>
  calls: number
  answer: (found: Stream[]) => void
} {
  const f = {
    calls: 0,
    pending: [] as ((found: Stream[]) => void)[],
    find(): Promise<Stream[]> {
      f.calls++
      return new Promise<Stream[]>((resolve) => f.pending.push(resolve))
    },
    answer(found: Stream[]): void {
      for (const r of f.pending.splice(0)) r(found)
    }
  }
  return f
}

const log = (): void => {}

describe('radio:play', () => {
  it('refuses what is not a station, and registers nothing', async () => {
    const f = finder()
    const p = new PlayedStations(saved([]), f.find, log)
    for (const raw of [null, 'x', { id: 'a/b', name: 'X', tags: [], streams: [s128] }])
      expect(await p.play(raw)).toBeUndefined()
    expect(f.calls).toBe(0)
  })

  it('registers a station from search, so the stream lookup finds it', async () => {
    const f = finder()
    const p = new PlayedStations(saved([]), f.find, log)
    expect(p.lookup('rb-1')).toBeUndefined()
    const got = await p.play(st('rb-1'))
    expect(got?.streams).toEqual([s128])
    expect(p.lookup('rb-1')?.streams).toEqual([s128])
  })

  it('waits for the server when the station has no streams yet (Metal Only)', async () => {
    const f = finder()
    const store = saved([st('metal-only', [], { pls: ['https://m.example/listen.pls'] })])
    const p = new PlayedStations(store, f.find, log)
    const answer = p.play(st('metal-only', [], { pls: ['https://m.example/listen.pls'] }))
    expect(f.calls).toBe(1)
    f.answer([s128, s320])
    expect((await answer)?.streams).toEqual([s128, s320])
    // saved to My stations
    expect(store.get('metal-only')?.streams).toEqual([s128, s320])
    expect(p.lookup('metal-only')?.streams).toEqual([s128, s320])
  })

  it('uses the saved station, not what the page sent', async () => {
    const f = finder()
    const store = saved([st('rb-1', [s128], { chosen: s128.url })])
    const p = new PlayedStations(store, f.find, log)
    const got = await p.play(st('rb-1', [{ url: 'https://evil.example/x' }]))
    expect(got?.streams).toEqual([s128])
    expect(got?.chosen).toBe(s128.url)
  })

  it('answers at once when streams are known, and adds new ones behind', async () => {
    const f = finder()
    const store = saved([st('rb-1')])
    const p = new PlayedStations(store, f.find, log)
    expect((await p.play(st('rb-1')))?.streams).toEqual([s128])
    expect(f.calls).toBe(1)
    f.answer([s320])
    await vi.waitFor(() => expect(store.get('rb-1')?.streams).toEqual([s128, s320]))
    expect((await p.play(st('rb-1')))?.streams).toEqual([s128, s320])
  })

  it('adds found streams to the registered copy of a station from search', async () => {
    const f = finder()
    const p = new PlayedStations(saved([]), f.find, log)
    await p.play(st('rb-1'))
    f.answer([s320])
    await vi.waitFor(() => expect(p.lookup('rb-1')?.streams).toEqual([s128, s320]))
  })

  it('asks the server once a run, but again while a station still has no streams', async () => {
    const f = finder()
    const p = new PlayedStations(saved([]), f.find, log)
    await p.play(st('rb-1'))
    f.answer([])
    await p.play(st('rb-1'))
    expect(f.calls).toBe(1)

    const pls = { pls: ['https://m.example/listen.pls'] }
    const first = p.play(st('mo', [], pls))
    f.answer([])
    expect((await first)?.streams).toEqual([])
    const second = p.play(st('mo', [], pls))
    expect(f.calls).toBe(3)
    f.answer([s128])
    expect((await second)?.streams).toEqual([s128])
  })

  it('keeps playing a station removed from My stations', async () => {
    const f = finder()
    const store = saved([st('rb-1')])
    const p = new PlayedStations(store, f.find, log)
    await p.play(st('rb-1'))
    store.list = []
    expect(p.lookup('rb-1')?.streams).toEqual([s128])
  })

  it('keeps a saved station’s own streams over an old registered copy', async () => {
    const f = finder()
    const store = saved([])
    const p = new PlayedStations(store, f.find, log)
    await p.play(st('rb-1'))
    store.list = [st('rb-1', [s320])]
    expect(p.lookup('rb-1')?.streams).toEqual([s320])
  })

  it('forgets the oldest stations from search after many', async () => {
    const f = finder()
    const p = new PlayedStations(saved([]), f.find, log)
    for (let i = 0; i < 101; i++) await p.play(st(`rb-${i}`))
    expect(p.lookup('rb-0')).toBeUndefined()
    expect(p.lookup('rb-100')).toBeDefined()
  })

  it('says which station plays at once, before the server answers', async () => {
    const f = finder()
    const store = saved([st('metal-only', [], { pls: ['https://m.example/listen.pls'] })])
    const started = vi.fn()
    const p = new PlayedStations(store, f.find, log, started)
    const answer = p.play(st('metal-only', [], { pls: ['https://m.example/listen.pls'] }))
    expect(started).toHaveBeenCalledWith(store.get('metal-only'))
    f.answer([s128])
    await answer
    expect(started).toHaveBeenCalledTimes(1)
  })

  it('sets the logo of the copy of a station from search', async () => {
    const p = new PlayedStations(saved([]), finder().find, log)
    await p.play(st('rb-1'))
    const logo = { hash: 'a'.repeat(40), palette: fallbackPalettes('x') }
    p.setLogo('rb-1', logo)
    expect(p.lookup('rb-1')?.logo).toEqual(logo)
    p.setLogo('rb-1', undefined)
    expect(p.lookup('rb-1')).not.toHaveProperty('logo')
    // not played: nothing to set
    p.setLogo('rb-2', logo)
    expect(p.lookup('rb-2')).toBeUndefined()
  })

  it('never takes a logo from the page', async () => {
    const p = new PlayedStations(saved([]), finder().find, log)
    const page = { hash: 'b'.repeat(40), palette: fallbackPalettes('y') }
    expect(await p.play(st('rb-1', [s128], { logo: page }))).not.toHaveProperty('logo')
    // played again: the copy main keeps has main's logo, not the page's
    const mine = { hash: 'a'.repeat(40), palette: fallbackPalettes('x') }
    p.setLogo('rb-1', mine)
    expect((await p.play(st('rb-1', [s128], { logo: page })))?.logo).toEqual(mine)
  })
})
