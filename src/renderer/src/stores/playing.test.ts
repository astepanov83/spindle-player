// The playing store with a fake engine: queue to radio and back, and what a
// restart brings back.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EngineEvents } from '../audio/engine'
import type { LibraryData, Track } from '../../../shared/library'
import type { Station } from '../../../shared/stations'
import { defaultPalettes } from '../../../shared/palette'

const fake = vi.hoisted(() => ({
  on: {} as Partial<EngineEvents>,
  loaded: false,
  calls: [] as string[]
}))

vi.mock('../audio/engine', () => ({
  mediaUrl: (id: string) => `media/${id}`,
  engine: {
    on: (e: Partial<EngineEvents>) => Object.assign(fake.on, e),
    get loaded() {
      return fake.loaded
    },
    el: { paused: true },
    load: (url: string, at = 0, _part?: unknown, opts?: { live?: boolean }) => {
      fake.loaded = true
      fake.calls.push(`load ${url.replace(/&c=\d+$/, '')}${opts?.live ? ' live' : ` at ${at}`}`)
    },
    continueWith: () => {},
    play: () => fake.calls.push('play'),
    pause: () => fake.calls.push('pause'),
    seek: (p: number) => fake.calls.push(`seek ${p}`),
    clear: () => {
      fake.loaded = false
      fake.calls.push('clear')
    },
    setVolume: () => {}
  }
}))

const savePlace = vi.fn()
const saveQueue = vi.fn()
const savePlaying = vi.fn()
vi.stubGlobal('window', {
  playbackApi: { log: vi.fn(), saveQueue, savePlace, savePlaying },
  radioApi: {
    play: async (s: Station) => s,
    choose: async () => [],
    history: async () => [],
    lastAnswer: async () => undefined,
    stop: () => {},
    onTitle: () => () => {}
  }
})

const { playing } = await import('./playing.svelte')
const { queue } = await import('./queue.svelte')
const { radio } = await import('./radio.svelte')
const { player } = await import('./player.svelte')
const { library } = await import('./library.svelte')

const tracks: Track[] = ['s0', 's1', 's2'].map((id, i) => ({
  id,
  title: `Song ${i}`,
  duration: 100,
  albumId: 'al',
  artist: 'X',
  album: 'Al',
  no: i + 1,
  disc: 1,
  codec: '',
  folder: 0
}))
const lib: LibraryData = {
  albums: [
    {
      id: 'al',
      title: 'Al',
      artist: 'X',
      year: 0,
      palette: defaultPalettes,
      cover: '',
      coverLarge: '',
      trackIds: tracks.map((t) => t.id)
    }
  ],
  tracks,
  folders: [{ name: '/m', parent: -1 }]
}

const station = (id: string): Station => ({
  id,
  name: `Station ${id}`,
  tags: [],
  streams: [{ url: `https://${id}/s`, bitrate: 128 }]
})
const mine = [station('a'), station('b'), station('c')]

const loads = (): string[] => fake.calls.filter((c) => c.startsWith('load'))

beforeEach(async () => {
  library.load(lib)
  radio.load(mine)
  await playing.backToQueue()
  queue.playList(['s0', 's1', 's2'], 1, 'Mix')
  fake.on.time!(42)
  fake.calls = []
  savePlace.mockClear()
  savePlaying.mockClear()
})

describe('queue to radio', () => {
  it('keeps the queue’s list and place', async () => {
    await playing.playStation(mine[0])
    expect(savePlace).toHaveBeenCalledWith({ index: 1, pos: 42 })
    expect(playing.kind).toBe('radio')
    expect(savePlaying).toHaveBeenLastCalledWith({ kind: 'radio', station: 'a' })
    expect(loads()).toEqual(['load spindle://radio/a?stream=0 live'])
    expect(queue.items).toEqual(['s0', 's1', 's2'])
    expect(queue.index).toBe(1)
    // the engine's time is the stream's now, not the song's
    fake.on.time!(5)
    fake.on.paused!()
    expect(player.pos).toBe(42)
    expect(savePlace).toHaveBeenCalledOnce()
  })

  it('shows the station', async () => {
    expect(playing.title).toBe('Song 1')
    expect(playing.sub).toBe('X · Al')
    await playing.playStation(mine[0])
    // no song title yet: the station, once
    expect(playing.title).toBe('Station a')
    expect(playing.sub).toBe('Radio')
    radio.title = 'Iron Maiden - Powerslave * Blacky OnAir *'
    expect(playing.title).toBe('Iron Maiden - Powerslave')
    expect(playing.sub).toBe('Station a')
    expect(playing.art?.palette).toEqual(defaultPalettes)
  })

  it('a library change does not touch the engine while radio plays', async () => {
    await playing.playStation(mine[0])
    fake.calls = []
    const left = tracks.filter((t) => t.id !== 's1')
    library.load({
      ...lib,
      albums: [{ ...lib.albums[0], trackIds: left.map((t) => t.id) }],
      tracks: left
    })
    queue.prune()
    expect(fake.calls).toEqual([])
    expect(playing.kind).toBe('radio')
  })

  it('next and previous step through My stations', async () => {
    await playing.playStation(mine[0])
    await playing.next()
    expect(radio.station?.id).toBe('b')
    await playing.prev()
    await playing.prev()
    expect(radio.station?.id).toBe('c')
    expect(savePlaying).toHaveBeenLastCalledWith({ kind: 'radio', station: 'c' })
    expect(queue.index).toBe(1)
  })
})

describe('back to the queue', () => {
  it('"Back to queue" loads the song paused at its place', async () => {
    await playing.playStation(mine[0])
    fake.calls = []
    await playing.backToQueue()
    expect(playing.kind).toBe('queue')
    expect(savePlaying).toHaveBeenLastCalledWith({ kind: 'queue' })
    expect(fake.calls).toEqual(['pause', 'load media/s1 at 42'])
    expect(player.playing).toBe(false)
  })

  it('playing a list or jumping in the queue switches back and plays', async () => {
    await playing.playStation(mine[0])
    fake.calls = []
    queue.jump(2)
    expect(playing.kind).toBe('queue')
    expect(fake.calls).toEqual(['pause', 'load media/s2 at 0', 'play'])
    await playing.playStation(mine[0])
    fake.calls = []
    queue.playList(['s0'], 0, 'One')
    expect(playing.kind).toBe('queue')
    expect(loads()).toEqual(['load media/s0 at 0'])
  })
})

describe('after a restart', () => {
  const saved = { items: ['s0', 's1', 's2'], index: 2, from: 'Mix', pos: 30 }

  it('radio comes back with the station selected and paused', async () => {
    await playing.backToQueue()
    fake.calls = []
    playing.restore({ ...saved, kind: 'radio', station: 'b' })
    expect(playing.kind).toBe('radio')
    expect(radio.station?.id).toBe('b')
    expect(player.playing).toBe(false)
    expect(loads()).toEqual([])
    // the queue waits at its place
    expect(queue.index).toBe(2)
    await playing.backToQueue()
    expect(loads()).toEqual(['load media/s2 at 30'])
  })

  it('the queue comes back paused where it was', async () => {
    fake.calls = []
    playing.restore(saved)
    expect(playing.kind).toBe('queue')
    expect(fake.calls).toEqual(['load media/s2 at 30'])
  })

  it('when My stations could not be read, the queue plays but radio stays saved', async () => {
    fake.calls = []
    savePlaying.mockClear()
    // the stations list is empty then, so the station is not found
    playing.restore({ ...saved, kind: 'radio', station: 'gone' }, false)
    expect(playing.kind).toBe('queue')
    expect(fake.calls).toEqual(['load media/s2 at 30'])
    expect(savePlaying).not.toHaveBeenCalled()
  })

  it('a station no longer in My stations gives the queue back', async () => {
    fake.calls = []
    playing.restore({ ...saved, kind: 'radio', station: 'gone' })
    expect(playing.kind).toBe('queue')
    expect(fake.calls).toEqual(['load media/s2 at 30'])
    expect(savePlaying).toHaveBeenLastCalledWith({ kind: 'queue' })
  })
})

describe('what shows as playing while radio plays (027 fix round 1)', () => {
  it('songs are not playing, and a seek does nothing to the queue’s place', async () => {
    fake.on.playing!()
    expect(playing.songPlaying).toBe(true)
    await playing.playStation(mine[0])
    fake.on.playing!()
    expect(player.playing).toBe(true)
    expect(playing.songPlaying).toBe(false)
    fake.calls = []
    playing.seek(90)
    expect(player.pos).toBe(42)
    expect(fake.calls).toEqual([])
  })

  it('a seek still works for a song', () => {
    player.duration = 100
    playing.seek(50)
    expect(player.pos).toBe(50)
    expect(fake.calls).toContain('seek 50')
  })
})
