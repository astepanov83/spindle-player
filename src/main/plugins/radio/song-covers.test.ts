import { hash } from 'crypto'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi, type Mock } from 'vitest'
import { fallbackPalettes, paletteVersion } from '../../../shared/palette'
import type { RadioCover } from '../../../shared/ipc'
import {
  notFoundMs,
  openSongCovers,
  parseSongCovers,
  pruneSongCovers,
  serializeSongCovers,
  songKey,
  SongCovers,
  type FindSong,
  type SongCoverMap,
  type SongCoversDeps
} from './song-covers'

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 7])
const h = hash('sha1', jpeg)
const palette = fallbackPalettes('song')
const on = { on: true, sources: { deezer: true, itunes: true } }
const off = { on: false, sources: { deezer: true, itunes: true } }

// A find the test answers by hand, one call at a time. ignoreAbort: the
// cancel was lost on the way, so the library process answers anyway.
function manualFind(ignoreAbort = false): {
  find: FindSong
  calls: { artist: string; song: string; signal: AbortSignal }[]
  answer: (r: Uint8Array | 'none' | 'later', i?: number) => Promise<void>
} {
  const calls: { artist: string; song: string; signal: AbortSignal }[] = []
  const waiting: ((r: Uint8Array | 'none' | 'later') => void)[] = []
  return {
    calls,
    find: (q, signal) =>
      new Promise((r) => {
        calls.push({ ...q, signal })
        waiting.push(r)
        // an abort ends the lookup the way the library process does
        if (!ignoreAbort) signal.addEventListener('abort', () => r('later'))
      }),
    answer: async (r, i = waiting.length - 1) => {
      waiting[i](r)
      await flush()
    }
  }
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

interface Rig {
  covers: SongCovers
  d: SongCoversDeps & { save: Mock; log: Mock }
  m: ReturnType<typeof manualFind>
  sent: RadioCover[]
  map: SongCoverMap
  order: string[]
  set: (s: typeof on) => void
}

function setup(
  opts: {
    setting?: typeof on
    map?: SongCoverMap
    files?: boolean
    now?: number
    ignoreAbort?: boolean
  } = {}
): Rig {
  const m = manualFind(opts.ignoreAbort)
  let setting = opts.setting ?? on
  const sent: RadioCover[] = []
  const order: string[] = []
  const map = opts.map ?? new Map()
  const d = {
    setting: () => setting,
    find: m.find,
    cache: {
      addLogo: vi.fn(async (hh: string) => {
        order.push(`add ${hh}`)
        return { palette, side: 600 }
      }),
      hasLogo: vi.fn(async () => opts.files ?? true),
      logoPalette: vi.fn(async () => palette)
    },
    map,
    save: vi.fn(),
    kept: vi.fn(() => void order.push('kept')),
    send: (c: RadioCover) => void sent.push(c),
    log: vi.fn(),
    now: () => opts.now ?? 1000
  }
  const covers = new SongCovers(d)
  return {
    covers,
    d,
    m,
    sent,
    map,
    order,
    set: (s) => {
      setting = s
    }
  }
}

describe('SongCovers (ticket 032)', () => {
  it('looks up an "Artist - Song" title and sends its cover with its colors', async () => {
    const { covers, m, sent, map, order, d } = setup()
    covers.heard('a', 'Iron Maiden - The Trooper', 'Metal Only')
    expect(m.calls.map((c) => [c.artist, c.song])).toEqual([['Iron Maiden', 'The Trooper']])
    await m.answer(jpeg)
    expect(sent).toEqual([
      { stationId: 'a', title: 'Iron Maiden - The Trooper', cover: { hash: h, palette } }
    ])
    // kept before its files are written, so a prune running now leaves them
    expect(order).toEqual(['kept', `add ${h}`])
    expect(covers.hashes()).toEqual([h])
    expect(map.get(songKey({ artist: 'Iron Maiden', song: 'The Trooper' }))).toEqual({
      cover: { hash: h, palette, v: paletteVersion },
      at: 1000
    })
    expect(d.save).toHaveBeenCalled()
  })

  it('sends nothing anywhere with the setting off', async () => {
    const { covers, m, sent, map } = setup({ setting: off })
    covers.heard('a', 'Iron Maiden - The Trooper', 'X')
    await flush()
    expect(m.calls).toEqual([])
    expect(sent).toEqual([])
    expect(map.size).toBe(0)
  })

  it('reads the setting at each title, since it can change while radio plays', async () => {
    const { covers, m, set } = setup({ setting: off })
    covers.heard('a', 'A - One', 'X')
    await flush()
    set(on)
    covers.heard('a', 'B - Two', 'X')
    await flush()
    expect(m.calls.map((c) => c.artist)).toEqual(['B'])
  })

  it('looks nothing up for jingles, shows and the DJ parts', async () => {
    const { covers, m } = setup()
    covers.heard('a', 'Station Jingle', 'X')
    covers.heard('a', '* Blacky OnAir * Metal Mittwoch *', 'Metal Only')
    covers.heard('a', 'Metal Only - Werbung', 'Metal Only')
    await flush()
    expect(m.calls).toEqual([])
    covers.heard('a', 'M-16 (USA) - Shot Down * Blacky OnAir * 60er Bis 95er Beat, Rock *', 'M')
    expect(m.calls.map((c) => [c.artist, c.song])).toEqual([['M-16 (USA)', 'Shot Down']])
  })

  it('drops a late answer for a title that changed, and stops its lookup', async () => {
    const { covers, m, sent } = setup()
    covers.heard('a', 'A - One', 'X')
    const first = m.calls[0]
    covers.heard('a', 'B - Two', 'X')
    expect(first.signal.aborted).toBe(true)
    // the library process had the picture already
    await m.answer(jpeg, 0)
    expect(sent).toEqual([])
    await m.answer('none', 1)
    expect(sent).toEqual([])
  })

  it('drops a picture that comes after its lookup was stopped, but keeps it for the song', async () => {
    const { covers, m, sent, map } = setup({ ignoreAbort: true })
    covers.heard('a', 'A - One', 'X')
    covers.heard('a', 'B - Two', 'X')
    expect(m.calls[0].signal.aborted).toBe(true)
    await m.answer(jpeg, 0)
    expect(sent).toEqual([])
    expect(map.get(songKey({ artist: 'A', song: 'One' }))?.cover?.hash).toBe(h)
  })

  it('does not wait on a stopped lookup when the title comes back (A, B, A)', async () => {
    const { covers, m, sent } = setup({ ignoreAbort: true })
    covers.heard('a', 'A - One', 'X')
    covers.heard('a', 'B - Two', 'X')
    covers.heard('a', 'A - One', 'X')
    expect(m.calls.map((c) => c.artist)).toEqual(['A', 'B', 'A'])
    await m.answer(jpeg, 2)
    expect(sent.map((c) => c.title)).toEqual(['A - One'])
  })

  it('looks up again when the setting goes off and on before the library process answered', async () => {
    const { covers, m, set } = setup({ ignoreAbort: true })
    covers.heard('a', 'A - B', 'X')
    set(off)
    covers.settingChanged()
    set(on)
    covers.settingChanged()
    expect(m.calls).toHaveLength(2)
    expect(m.calls[0].signal.aborted).toBe(true)
    expect(m.calls[1].signal.aborted).toBe(false)
  })

  it('stops a lookup when a service is turned off, and asks again with the others', async () => {
    const { covers, m, set, sent } = setup()
    covers.heard('a', 'A - B', 'X')
    set({ on: true, sources: { deezer: true, itunes: false } })
    covers.settingChanged()
    expect(m.calls[0].signal.aborted).toBe(true)
    expect(m.calls).toHaveLength(2)
    await m.answer(jpeg, 1)
    expect(sent).toHaveLength(1)
  })

  it('forgets the title when radio stops: turning the setting on later looks nothing up', async () => {
    const { covers, m, set, sent } = setup({ setting: off })
    covers.heard('a', 'A - B', 'X')
    covers.stopped()
    set(on)
    covers.settingChanged()
    await flush()
    expect(m.calls).toEqual([])
    expect(sent).toEqual([])
  })

  it('stops the lookup and drops its answer when radio stops', async () => {
    const { covers, m, sent } = setup({ ignoreAbort: true })
    covers.heard('a', 'A - B', 'X')
    covers.stopped()
    expect(m.calls[0].signal.aborted).toBe(true)
    await m.answer(jpeg, 0)
    expect(sent).toEqual([])
  })

  it('drops an answer for the last station after another started', async () => {
    const { covers, m, sent } = setup()
    covers.heard('a', 'A - One', 'X')
    covers.heard('b', 'A - One', 'Y')
    // the same song on the next station: one lookup, sent for the station playing
    expect(m.calls).toHaveLength(1)
    await m.answer(jpeg)
    expect(sent.map((c) => c.stationId)).toEqual(['b'])
  })

  it('keeps what it found by artist and song, so a song played again is not looked up', async () => {
    const { covers, m, sent } = setup()
    covers.heard('a', 'Iron Maiden - The Trooper', 'X')
    await m.answer(jpeg)
    covers.heard('a', 'Jingle', 'X')
    // cleanup makes these the same song
    covers.heard('a', 'IRON MAIDEN - The Trooper (1998 Remaster)', 'X')
    await flush()
    expect(m.calls).toHaveLength(1)
    expect(sent.map((c) => c.title)).toEqual([
      'Iron Maiden - The Trooper',
      'IRON MAIDEN - The Trooper (1998 Remaster)'
    ])
  })

  it('keeps a miss too, so a repeated jingle with a dash is not looked up again', async () => {
    const { covers, m, sent, map } = setup()
    covers.heard('a', 'Radio X - Your Station', 'Other')
    await m.answer('none')
    covers.heard('a', 'A - B', 'X')
    await m.answer('none')
    covers.heard('a', 'Radio X - Your Station', 'Other')
    await flush()
    expect(m.calls).toHaveLength(2)
    expect(sent).toEqual([])
    expect([...map.values()][0]).toEqual({ at: 1000 })
  })

  it('looks a miss up again after 30 days', async () => {
    const key = songKey({ artist: 'A', song: 'B' })
    const map: SongCoverMap = new Map([[key, { at: 0 }]])
    const { covers, m } = setup({ map, now: notFoundMs + 1 })
    covers.heard('a', 'A - B', 'X')
    await flush()
    expect(m.calls).toHaveLength(1)
  })

  it('keeps nothing when a service failed, so the next play looks again', async () => {
    const { covers, m, map } = setup()
    covers.heard('a', 'A - B', 'X')
    await m.answer('later')
    expect(map.size).toBe(0)
    covers.heard('a', 'C - D', 'X')
    covers.heard('a', 'A - B', 'X')
    await flush()
    expect(m.calls).toHaveLength(3)
  })

  it('looks a found song up again when its files are gone from the cache', async () => {
    const key = songKey({ artist: 'A', song: 'B' })
    const map: SongCoverMap = new Map([
      [key, { cover: { hash: h, palette, v: paletteVersion }, at: 1 }]
    ])
    const gone = setup({ map, files: false })
    gone.covers.heard('a', 'A - B', 'X')
    await flush()
    expect(gone.m.calls).toHaveLength(1)
    const there = setup({ map: new Map(map) })
    there.covers.heard('a', 'A - B', 'X')
    await flush()
    expect(there.m.calls).toHaveLength(0)
    expect(there.sent).toHaveLength(1)
  })

  it('uses a found cover with the setting off: nothing is sent anywhere for it', async () => {
    const key = songKey({ artist: 'A', song: 'B' })
    const map: SongCoverMap = new Map([
      [key, { cover: { hash: h, palette, v: paletteVersion }, at: 1 }]
    ])
    const { covers, m, sent } = setup({ map, setting: off })
    covers.heard('a', 'A - B', 'X')
    await flush()
    expect(m.calls).toEqual([])
    expect(sent).toHaveLength(1)
  })

  it('stops its lookups when the setting is turned off, and looks the title up when turned on', async () => {
    const { covers, m, set, sent } = setup()
    covers.heard('a', 'A - B', 'X')
    set(off)
    covers.settingChanged()
    expect(m.calls[0].signal.aborted).toBe(true)
    await flush()
    set(on)
    covers.settingChanged()
    expect(m.calls).toHaveLength(2)
    await m.answer(jpeg)
    expect(sent).toHaveLength(1)
  })

  it('forgets misses when a service is turned on', async () => {
    const key = songKey({ artist: 'A', song: 'B' })
    const map: SongCoverMap = new Map([[key, { at: 1 }]])
    const { covers, set, d } = setup({
      map,
      setting: { on: true, sources: { deezer: true, itunes: false } }
    })
    set(on)
    covers.settingChanged()
    expect(map.size).toBe(0)
    expect(d.save).toHaveBeenCalled()
  })

  it('gives the covers of known titles, for the recent songs', async () => {
    const { covers, m } = setup()
    covers.heard('a', 'A - B', 'X')
    await m.answer(jpeg)
    expect(covers.known('A - B (Remastered)')).toEqual({ hash: h, palette })
    expect(covers.known('Jingle')).toBeUndefined()
  })
})

describe('songKey', () => {
  it('keeps a live recording apart from the studio song, with brackets or " - "', () => {
    const studio = songKey({ artist: 'Iron Maiden', song: 'The Trooper' })
    expect(songKey({ artist: 'Iron Maiden', song: 'The Trooper - Live Version' })).not.toBe(studio)
    expect(songKey({ artist: 'Iron Maiden', song: 'The Trooper (Live Version)' })).not.toBe(studio)
    expect(songKey({ artist: 'Iron Maiden', song: 'The Trooper - 2015 Remaster' })).toBe(studio)
  })
})

describe('the song covers file', () => {
  const key = songKey({ artist: 'A', song: 'B' })

  it('reads what it wrote and drops bad entries', () => {
    const map: SongCoverMap = new Map([
      [key, { cover: { hash: h, palette, small: true, v: 3 }, at: 5 }],
      ['x\0y', { at: 6 }]
    ])
    expect(parseSongCovers(JSON.parse(JSON.stringify(serializeSongCovers(map))))).toEqual(map)
    const bad = { version: 1, songs: { a: { at: 'x' }, b: { cover: { hash: 'no' }, at: 1 } } }
    expect(parseSongCovers(bad).size).toBe(0)
    expect(parseSongCovers(null).size).toBe(0)
  })

  it('keeps found covers of titles still in the history, and misses for 30 days', () => {
    const map: SongCoverMap = new Map([
      [key, { cover: { hash: h, palette }, at: 1 }],
      [songKey({ artist: 'Old', song: 'Song' }), { cover: { hash: h, palette }, at: 1 }],
      [songKey({ artist: 'New', song: 'Miss' }), { at: 100 }],
      [songKey({ artist: 'Old', song: 'Miss' }), { at: 0 }]
    ])
    expect(pruneSongCovers(map, ['A - B * DJ OnAir *', 'Jingle'], notFoundMs + 50)).toBe(true)
    expect([...map.keys()]).toEqual([key, songKey({ artist: 'New', song: 'Miss' })])
    expect(pruneSongCovers(map, ['A - B'], notFoundMs + 50)).toBe(false)
  })
})

describe('openSongCovers', () => {
  it('reads the file, prunes it by the history and saves changes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'song-covers-'))
    try {
      const path = join(dir, 'radio-covers.json')
      const a = openSongCovers(path, [], 0, () => {})
      a.map.set(songKey({ artist: 'A', song: 'B' }), { cover: { hash: h, palette }, at: 1 })
      a.map.set(songKey({ artist: 'C', song: 'D' }), { cover: { hash: h, palette }, at: 1 })
      a.save()
      a.flushSync()
      const b = openSongCovers(path, ['A - B'], 10, () => {})
      expect([...b.map.keys()]).toEqual([songKey({ artist: 'A', song: 'B' })])
      // a broken cache starts empty and is written again
      writeFileSync(path, 'nope')
      const logs: string[] = []
      const c = openSongCovers(path, [], 0, (t) => logs.push(t))
      expect(c.map.size).toBe(0)
      expect(logs).toHaveLength(1)
      c.save()
      c.flushSync()
      expect(readdirSync(dir)).toEqual(['radio-covers.json'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
