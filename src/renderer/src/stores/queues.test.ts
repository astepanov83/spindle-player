// The queues with radio as the live plugin and a fake engine: the track
// queue to radio and back, radio turned off, and what a restart brings back.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyQueues, type SavedQueues } from '../../../shared/saved-queue'
import type { EngineEvents } from '../audio/engine'
import type { LibraryData, Track } from '../../../shared/library'
import type { RadioTitle } from '../../../shared/ipc'
import { itemKey } from '../../../shared/plugins/items'
import type { Station } from '../../../shared/stations'
import { defaultPalettes } from '../../../shared/palette'

const fake = vi.hoisted(() => ({
  on: {} as Partial<EngineEvents>,
  loaded: false,
  calls: [] as string[]
}))

vi.mock('../audio/engine', () => ({
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
const stop = vi.fn()
let heard: (t: RadioTitle) => void = () => {}
vi.stubGlobal('window', {
  playbackApi: { log: vi.fn(), saveQueue, savePlace, savePlaying },
  radioApi: {
    play: async (s: Station) => s,
    choose: async () => [],
    history: async () => [],
    lastAnswer: async () => undefined,
    stop,
    onTitle: (l: (t: RadioTitle) => void) => {
      heard = l
      return () => {}
    },
    onLogo: () => () => {},
    onCover: () => () => {}
  }
})

const { queues } = await import('./queues.svelte')
const { queue } = await import('./queue.svelte')
const { radio } = await import('../plugins/radio/store.svelte')
const { player } = await import('./player.svelte')
const { library } = await import('./library.svelte')
const { settings } = await import('./settings.svelte')
const { mfp } = await import('../plugins/mfp/store.svelte')

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

// as the Radio view plays a station
function playStation(s: Station): Promise<void> {
  let p: Promise<void> = Promise.resolve()
  radio.playOffered(s, () => (p = queues.playLive(itemKey('radio', s.id))))
  return p
}

const loads = (): string[] => fake.calls.filter((c) => c.startsWith('load'))

beforeEach(async () => {
  settings.plugins.radio = true
  library.load(lib)
  radio.load(mine)
  await queues.backToQueue()
  queue.playList(['files:s0', 'files:s1', 'files:s2'], 1, 'Mix')
  fake.on.time!(42)
  fake.calls = []
  savePlace.mockClear()
  savePlaying.mockClear()
})

describe('queue to radio', () => {
  it('keeps the queue’s list and place', async () => {
    await playStation(mine[0])
    expect(savePlace).toHaveBeenCalledWith({ index: 1, pos: 42 })
    expect(queues.active).toBe('live')
    expect(savePlaying).toHaveBeenLastCalledWith({ active: 'live', current: 'radio:a' })
    expect(loads()).toEqual(['load spindle://radio/a?stream=0 live'])
    expect(queue.items).toEqual(['files:s0', 'files:s1', 'files:s2'])
    expect(queue.index).toBe(1)
    // the engine's time is the stream's now, not the song's
    fake.on.time!(5)
    fake.on.paused!()
    expect(player.pos).toBe(42)
    expect(savePlace).toHaveBeenCalledOnce()
  })

  it('shows the station', async () => {
    expect(queues.title).toBe('Song 1')
    expect(queues.sub).toBe('X · Al')
    await playStation(mine[0])
    // no song title yet: the station, once
    expect(queues.title).toBe('Station a')
    expect(queues.sub).toBe('Radio')
    // the system's media controls: the station as the artist, as before 057
    expect(queues.media).toEqual({ title: 'Station a', artist: 'Station a', album: '' })
    heard({ stationId: 'a', title: 'Iron Maiden - Powerslave * Blacky OnAir *', at: 1 })
    expect(queues.title).toBe('Iron Maiden - Powerslave')
    expect(queues.sub).toBe('Station a')
    expect(queues.art?.palette).toEqual(defaultPalettes)
    // the system's media controls: the song, by the station
    expect(queues.media).toEqual({
      title: 'Iron Maiden - Powerslave',
      artist: 'Station a',
      album: ''
    })
    // the station's name links to the Radio view
    expect(queues.info?.names).toEqual([{ name: 'Station a', to: { plugin: 'radio', page: '' } }])
  })

  it('shows the station’s recent songs in the Queue part', async () => {
    await playStation(mine[0])
    heard({ stationId: 'a', title: 'Dio - Holy Diver', at: 5 })
    expect(queues.live.history.at(-1)).toEqual({
      at: 5,
      title: 'Holy Diver',
      subtitle: 'Dio',
      now: true
    })
    // another station's titles are not its
    const n = queues.live.history.length
    heard({ stationId: 'b', title: 'X - Y', at: 6 })
    expect(queues.live.history).toHaveLength(n)
  })

  it('a library change does not touch the engine while radio plays', async () => {
    await playStation(mine[0])
    fake.calls = []
    const left = tracks.filter((t) => t.id !== 's1')
    library.load({
      ...lib,
      albums: [{ ...lib.albums[0], trackIds: left.map((t) => t.id) }],
      tracks: left
    })
    queue.refresh()
    expect(fake.calls).toEqual([])
    expect(queues.active).toBe('live')
  })

  it('next and previous step through My stations', async () => {
    await playStation(mine[0])
    await queues.next()
    expect(radio.station?.id).toBe('b')
    await queues.prev()
    await queues.prev()
    expect(radio.station?.id).toBe('c')
    expect(savePlaying).toHaveBeenLastCalledWith({ active: 'live', current: 'radio:c' })
    expect(queue.index).toBe(1)
  })
})

describe('playing marks', () => {
  it('mark the queue’s song only while the queue plays', async () => {
    expect(queues.item).toBe('files:s1')
    expect(queues.isItem('files:s1')).toBe(true)
    expect(queues.isItem('files:s0')).toBe(false)
    await playStation(mine[0])
    // the queue keeps its place, but radio sounds
    expect(queue.current).toBe('files:s1')
    expect(queues.item).toBeUndefined()
    expect(queues.isItem('files:s1')).toBe(false)
  })
})

describe('back to the queue', () => {
  it('"Back to queue" loads the song paused at its place', async () => {
    await playStation(mine[0])
    fake.calls = []
    await queues.backToQueue()
    expect(queues.active).toBe('track')
    expect(savePlaying).toHaveBeenLastCalledWith({ active: 'track' })
    expect(fake.calls).toEqual(['pause', 'load spindle://media/s1 at 42'])
    expect(player.playing).toBe(false)
  })

  it('playing a list or jumping in the queue switches back and plays', async () => {
    await playStation(mine[0])
    fake.calls = []
    queue.jump(2)
    expect(queues.active).toBe('track')
    expect(fake.calls).toEqual(['pause', 'load spindle://media/s2 at 0', 'play'])
    await playStation(mine[0])
    fake.calls = []
    queue.playList(['files:s0'], 0, 'One')
    expect(queues.active).toBe('track')
    expect(loads()).toEqual(['load spindle://media/s0 at 0'])
  })
})

describe('Play while the song waits for its plugin (ticket 056)', () => {
  it('plays it once its data is in, without a second press', async () => {
    settings.plugins.mfp = true
    // MFP was just turned on: its episodes are not in yet
    queue.restore({ items: ['mfp:m1'], index: 0, from: 'X', pos: 0 })
    fake.calls = []
    queues.togglePlay()
    expect(fake.calls).toEqual([])
    mfp.status = { episodes: 1, fetchedAt: 1, running: false }
    const songs = [{ id: 'm1', title: 'M', artist: 'X', start: 0, length: 100 }]
    mfp.load({
      episodes: [{ id: 'ep', title: 'E', artist: 'X', year: 0, link: '', length: 100, songs }]
    })
    queue.refresh()
    expect(fake.calls).toEqual(['load spindle://mfp/ep at 0', 'play'])
    settings.plugins.mfp = false
  })
})

describe('after a restart', () => {
  const saved: SavedQueues = {
    ...emptyQueues(),
    track: { items: ['files:s0', 'files:s1', 'files:s2'], index: 2, from: 'Mix', pos: 30 }
  }
  const onRadio = (station: string): SavedQueues => ({
    ...saved,
    live: { current: `radio:${station}` },
    active: 'live'
  })

  it('radio comes back with the station selected and paused', async () => {
    await queues.backToQueue()
    fake.calls = []
    queues.restore(onRadio('b'))
    expect(queues.active).toBe('live')
    expect(radio.station?.id).toBe('b')
    expect(player.playing).toBe(false)
    expect(loads()).toEqual([])
    // the queue waits at its place
    expect(queue.index).toBe(2)
    await queues.backToQueue()
    expect(loads()).toEqual(['load spindle://media/s2 at 30'])
  })

  it('the queue comes back paused where it was', async () => {
    fake.calls = []
    queues.restore(saved)
    expect(queues.active).toBe('track')
    expect(fake.calls).toEqual(['load spindle://media/s2 at 30'])
  })

  it('when My stations could not be read, the queue plays but radio stays saved', async () => {
    fake.calls = []
    savePlaying.mockClear()
    // main.ts leaves My stations not loaded then
    radio.loaded = false
    queues.restore(onRadio('gone'))
    expect(queues.active).toBe('track')
    expect(fake.calls).toEqual(['load spindle://media/s2 at 30'])
    expect(savePlaying).not.toHaveBeenCalled()
  })

  it('after that, playing a song saves the queue, so the next start brings the song back', async () => {
    radio.loaded = false
    queues.restore(onRadio('gone'))
    savePlaying.mockClear()
    queue.jump(0)
    expect(savePlaying).toHaveBeenCalledWith({ active: 'track' })
    savePlaying.mockClear()
    queue.jump(1)
    expect(savePlaying).not.toHaveBeenCalled()
  })

  it('a station no longer in My stations gives the queue back', async () => {
    fake.calls = []
    queues.restore(onRadio('gone'))
    expect(queues.active).toBe('track')
    expect(fake.calls).toEqual(['load spindle://media/s2 at 30'])
    expect(savePlaying).toHaveBeenLastCalledWith({ active: 'track' })
  })
})

describe('what shows as playing while radio plays (027 fix round 1)', () => {
  it('songs are not playing, and a seek does nothing to the queue’s place', async () => {
    fake.on.playing!()
    expect(queues.songPlaying).toBe(true)
    await playStation(mine[0])
    fake.on.playing!()
    expect(player.playing).toBe(true)
    expect(queues.songPlaying).toBe(false)
    fake.calls = []
    queues.seek(90)
    expect(player.pos).toBe(42)
    expect(fake.calls).toEqual([])
  })

  it('a seek still works for a song', () => {
    player.duration = 100
    queues.seek(50)
    expect(player.pos).toBe(50)
    expect(fake.calls).toContain('seek 50')
  })
})

describe('radio turned off (ticket 057)', () => {
  const saved: SavedQueues = {
    version: 2,
    track: { items: ['files:s0', 'files:s1', 'files:s2'], index: 2, from: 'Mix', pos: 30 },
    live: { current: 'radio:b' },
    active: 'live'
  }

  it('while a station plays: back to the queue, paused at its place', async () => {
    await playStation(mine[0])
    fake.calls = []
    stop.mockClear()
    settings.plugins.radio = false
    queues.refresh()
    expect(queues.active).toBe('track')
    expect(stop).toHaveBeenCalled()
    expect(fake.calls).toEqual(['pause', 'load spindle://media/s1 at 42'])
    expect(player.playing).toBe(false)
    expect(savePlaying).toHaveBeenLastCalledWith({ active: 'track' })
    // on again: nothing starts by itself
    fake.calls = []
    settings.plugins.radio = true
    queues.refresh()
    expect(queues.active).toBe('track')
    expect(fake.calls).toEqual([])
  })

  it('a station can’t be played while it is off', async () => {
    settings.plugins.radio = false
    fake.calls = []
    await playStation(mine[0])
    expect(queues.active).toBe('track')
    expect(fake.calls).toEqual([])
  })

  it('a search result refused while off is not left behind as a station (fix round 1)', async () => {
    const { itemInfo } = await import('../plugins')
    settings.plugins.radio = false
    await playStation(station('found'))
    settings.plugins.radio = true
    expect(radio.find('found')).toBeUndefined()
    expect(itemInfo('radio:found').state).toBe('missing')
  })

  it('off and on again: My stations and the recent songs are all there', async () => {
    await playStation(mine[0])
    heard({ stationId: 'a', title: 'Dio - Holy Diver', at: 5 })
    settings.plugins.radio = false
    queues.refresh()
    settings.plugins.radio = true
    queues.refresh()
    expect(radio.stations).toEqual(mine)
    await playStation(mine[0])
    expect(queues.live.history.map((e) => e.title)).toEqual(['Holy Diver'])
    expect(loads()).toContain('load spindle://radio/a?stream=0 live')
  })

  it('a start with radio off: the track queue comes back and queue.json says so', () => {
    settings.plugins.radio = false
    fake.calls = []
    savePlaying.mockClear()
    queues.restore(saved)
    expect(queues.active).toBe('track')
    expect(fake.calls).toEqual(['load spindle://media/s2 at 30'])
    expect(savePlaying).toHaveBeenCalledWith({ active: 'track' })
  })
})
