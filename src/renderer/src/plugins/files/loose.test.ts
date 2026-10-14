// Songs not in the library (ticket 124): sent with an open, or asked of main
// for a key from an earlier run, and how the queue sees them.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Track } from '../../../../shared/library'
import type { LooseSong, OpenedSongs } from '../../../../shared/plugins/files/loose'
import { defaultPalettes } from '../../../../shared/palette'
import { LooseStore } from './loose'

const song = (id: string, more: Partial<Track> = {}): LooseSong => ({
  track: {
    id,
    title: 'Open',
    duration: 120,
    albumId: 'al',
    artist: 'Marina Vale',
    album: 'Live',
    no: 1,
    disc: 1,
    codec: 'FLAC',
    folder: -1,
    art: { palette: defaultPalettes, cover: 'spindle://cover/small/x', coverLarge: '' },
    ...more
  },
  file: 'f1'
})

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

let mod: typeof import('./loose.svelte')
let tracks: typeof import('./tracks')

beforeEach(async () => {
  vi.resetModules()
  mod = await import('./loose.svelte')
  tracks = await import('./tracks')
})

// a plain counter in place of the page's $state
const counter = (): { get(): number; bump(): void } => {
  let n = 0
  return { get: () => n, bump: () => void n++ }
}

describe('LooseStore', () => {
  it('has the songs main sent with an open', () => {
    const s = new LooseStore(counter(), async () => ({ ids: [], loose: [] }))
    const v = s.version
    s.add([song('/x/a.flac')])
    expect(s.find('/x/a.flac')?.file).toBe('f1')
    expect(s.version).toBeGreaterThan(v)
  })

  it('asks main once, in one batch, for keys it has not got', async () => {
    const asks: string[][] = []
    const s = new LooseStore(counter(), async (ids): Promise<OpenedSongs> => {
      asks.push(ids)
      return { ids, loose: [song('/x/a.flac')], gone: ['/x/gone.mp3'] }
    })
    expect(s.gone('/x/a.flac')).toBe(false)
    expect(s.gone('/x/gone.mp3')).toBe(false)
    expect(s.gone('/x/a.flac')).toBe(false)
    await tick()
    expect(asks).toEqual([['/x/a.flac', '/x/gone.mp3']])
    expect(s.find('/x/a.flac')?.track.title).toBe('Open')
    expect(s.gone('/x/gone.mp3')).toBe(true)
  })

  it('asks again after a wait when main had no answer', async () => {
    let fail = true
    const later: (() => void)[] = []
    const asks: string[][] = []
    const s = new LooseStore(
      counter(),
      async (ids) => {
        asks.push(ids)
        if (fail) throw new Error('restarting')
        return { ids, loose: [song('/x/a.flac')] }
      },
      (f) => later.push(f)
    )
    s.gone('/x/a.flac')
    await tick()
    s.gone('/x/a.flac')
    await tick()
    expect(asks).toHaveLength(1)
    fail = false
    later.forEach((f) => f())
    s.gone('/x/a.flac')
    await tick()
    expect(asks).toHaveLength(2)
    expect(s.find('/x/a.flac')).toBeDefined()
  })
})

describe('a song not in the library in the queue', () => {
  it('is on its way, then shows with no links but Show in file manager', async () => {
    vi.stubGlobal('window', {
      libraryApi: { loose: async (ids: string[]) => ({ ids, loose: [song('/x/a.flac')] }) }
    })
    expect(tracks.trackState('/x/a.flac', () => true)).toEqual({ state: 'loading' })
    await tick()
    const s = tracks.trackState('/x/a.flac', () => true)
    if (s.state !== 'ok') throw new Error(s.state)
    expect(s.info).toMatchObject({ title: 'Open', subtitle: 'Marina Vale', group: 'Live' })
    expect(s.info.art?.cover).toBe('spindle://cover/small/x')
    expect(s.info.groupTo).toBeUndefined()
    expect(s.info.titleTo).toBeUndefined()
    expect(s.info.links).toBeUndefined()
    expect(s.info.names).toEqual([{ name: 'Marina Vale' }])
    expect(s.info.menu).toEqual([{ id: tracks.showFileId, label: 'Show in file manager' }])
  })

  it('is gone when main says its file is', async () => {
    vi.stubGlobal('window', {
      libraryApi: { loose: async (ids: string[]) => ({ ids: [], loose: [], gone: ids }) }
    })
    tracks.trackState('/x/gone.mp3', () => false)
    await tick()
    expect(tracks.trackState('/x/gone.mp3', () => false)).toEqual({ state: 'missing' })
  })

  it('plays from its file, a cue track from its part of it', () => {
    mod.loose.add([
      song('/x/a.flac', { gain: { track: -3 }, rate: 44100 }),
      { ...song('/x/Live.cue#2', { part: { file: 'img', start: 120 } }), file: 'img' }
    ])
    expect(tracks.trackPlayable('/x/a.flac')).toMatchObject({
      url: 'spindle://media/f1',
      length: 120,
      codec: 'FLAC',
      gain: { track: -3 },
      rate: 44100
    })
    expect(tracks.trackPlayable('/x/Live.cue#2')).toMatchObject({
      url: 'spindle://media/img',
      part: { file: 'img', start: 120 }
    })
  })
})
