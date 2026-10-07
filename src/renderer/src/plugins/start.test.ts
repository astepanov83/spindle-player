// Each plugin's start, from fake answers of main: asked at once, loaded in
// list order once the core says so, and listening to main only after that.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IdMoves } from '../../../shared/id-moves'
import type { LibraryData } from '../../../shared/library'
import { defaultPalettes } from '../../../shared/palette'
import type { MfpEpisodes } from '../../../shared/plugins/mfp/mfp'
import type { Station } from '../../../shared/plugins/radio/stations'

// the queue store's engine plays nothing here
vi.mock('../audio/engine', () => ({
  engine: { on: () => {}, el: { paused: true }, loaded: false }
}))

const library: LibraryData = {
  albums: [
    {
      id: 'al',
      title: 'Album',
      artist: 'A',
      year: 0,
      added: 0,
      palette: defaultPalettes,
      cover: '',
      coverLarge: '',
      trackIds: ['new']
    }
  ],
  tracks: [
    {
      id: 'new',
      title: 'S',
      duration: 1,
      albumId: 'al',
      artist: 'A',
      album: 'Album',
      no: 1,
      disc: 1,
      codec: 'FLAC',
      folder: 0
    }
  ],
  folders: [{ name: '/m', parent: -1 }]
}
const bytes = (v: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(v))
const station: Station = { id: 'metal-only', name: 'Metal Only', tags: [], streams: [] }
const mixes: MfpEpisodes = { episodes: [] }

let asked: string[]
let listening: string[]
// the listeners main's news goes to, by name
let heard: Record<string, (v: unknown) => void>
let stationsFail: boolean

function fakeWindow(moves: IdMoves): void {
  const on = (name: string) => (listener: (v: unknown) => void) => {
    listening.push(name)
    heard[name] = listener
    return () => {}
  }
  vi.stubGlobal('window', {
    libraryApi: {
      load: async () => {
        asked.push('library')
        return {
          library: bytes({ ...library, epoch: 'e', n: 1 }),
          status: { phase: 'idle', folders: [] },
          moves
        }
      },
      onIdsMoved: on('ids'),
      onChanged: on('changed'),
      onStatus: on('status')
    },
    radioApi: {
      stations: async () => {
        asked.push('stations')
        if (stationsFail) throw new Error('no')
        return [station]
      },
      onTitle: () => () => {},
      onLogo: () => () => {},
      onCover: () => () => {}
    },
    mfpApi: {
      get: async () => {
        asked.push('mfp')
        return mixes
      },
      onEpisodes: on('episodes'),
      onStatus: on('mfp-status')
    }
  })
}

let p: typeof import('./index')
let files: typeof import('./files/store.svelte').files
let radio: typeof import('./radio/store.svelte').radio

beforeEach(async () => {
  asked = []
  listening = []
  heard = {}
  stationsFail = false
  vi.resetModules()
  fakeWindow({ old: 'new', gone: 'later' })
  p = await import('./index')
  files = (await import('./files/store.svelte')).files
  radio = (await import('./radio/store.svelte')).radio
})

describe('startPlugins', () => {
  it('asks every plugin at once, and MFP listens before it asks', () => {
    void p.startPlugins()
    expect(asked).toEqual(['library', 'stations', 'mfp'])
    expect(listening).toEqual(['episodes', 'mfp-status'])
  })

  it('loads nothing until asked, then each plugin in list order', async () => {
    const started = await p.startPlugins()
    expect(files.has('new')).toBe(false)
    expect(radio.loaded).toBe(false)
    const moved = started.load()
    expect(files.has('new')).toBe(true)
    expect(radio.loaded).toBe(true)
    // only the moves whose new id is in the library now; the rest wait for it
    expect(moved).toEqual([{ plugin: 'files', moves: { old: 'new' } }])
  })

  it("hears main's news only once the core says so", async () => {
    const started = await p.startPlugins()
    started.load()
    expect(listening).not.toContain('changed')
    started.listen(() => {})
    expect(listening).toEqual(expect.arrayContaining(['changed', 'status']))
  })

  it('loads the others when one ask fails', async () => {
    stationsFail = true
    const started = await p.startPlugins()
    started.load()
    expect(radio.loaded).toBe(false)
    expect(files.has('new')).toBe(true)
  })

  it('sends ids that move later to the core with the library that has them, as its own', async () => {
    const started = await p.startPlugins()
    started.load()
    const idsMoved = vi.fn()
    started.listen(idsMoved)
    heard.ids({ x: 'y' })
    expect(idsMoved).not.toHaveBeenCalled()
    heard.changed(bytes({ ...library, epoch: 'e', n: 2 }))
    // with the one that waited for a library that has its new id
    expect(idsMoved).toHaveBeenCalledWith('files', { gone: 'later', x: 'y' })
  })
})
