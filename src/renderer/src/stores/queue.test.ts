// The queue store with a fake engine: what it plays after an end, a failure,
// Previous and a rescan.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EngineError, EngineEvents } from '../audio/engine'
import type { Album, LibraryData, Track } from '../../../shared/library'
import { defaultPalettes } from '../../../shared/palette'

const fake = vi.hoisted(() => ({
  on: {} as Partial<EngineEvents>,
  loaded: false,
  calls: [] as string[],
  reset() {
    this.calls = []
  }
}))

vi.mock('../audio/engine', () => ({
  mediaUrl: (id: string) => `media/${id}`,
  engine: {
    on: (e: Partial<EngineEvents>) => Object.assign(fake.on, e),
    get loaded() {
      return fake.loaded
    },
    load: (url: string, at = 0, part?: { start: number; end?: number }) => {
      fake.loaded = true
      fake.calls.push(`load ${url}` + (part ? ` ${part.start}-${part.end ?? 'end'} at ${at}` : ''))
    },
    continueWith: (part: { start: number; end?: number }) =>
      fake.calls.push(`continue ${part.start}-${part.end ?? 'end'}`),
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

const log = vi.fn()
const saveQueue = vi.fn()
const savePlace = vi.fn()
vi.stubGlobal('window', { playbackApi: { log, saveQueue, savePlace } })

const { queue } = await import('./queue.svelte')
// playing.svelte.ts passes the engine's events on; here they go to the queue straight
Object.assign(fake.on, queue.events)
const { player } = await import('./player.svelte')
const { library } = await import('./library.svelte')
const { notice } = await import('./notice.svelte')

function album(id: string, n: number): { album: Album; tracks: Track[] } {
  const tracks = Array.from({ length: n }, (_, i) => ({
    id: `${id}${i}`,
    title: `${id.toUpperCase()} ${i}`,
    duration: 100,
    albumId: id,
    artist: 'X',
    album: id,
    no: i + 1,
    disc: 1,
    codec: '',
    folder: 0
  }))
  return {
    album: {
      id,
      title: `Album ${id}`,
      artist: 'X',
      year: 0,
      palette: defaultPalettes,
      cover: '',
      coverLarge: '',
      trackIds: tracks.map((t) => t.id)
    },
    tracks
  }
}

function lib(...albums: [string, number][]): LibraryData {
  const made = albums.map(([id, n]) => album(id, n))
  return {
    albums: made.map((m) => m.album),
    tracks: made.flatMap((m) => m.tracks),
    folders: [{ name: '/m', parent: -1 }]
  }
}

const bad: EngineError = { code: 4, message: 'no supported streams', gone: false }
const playing = (): string | undefined => queue.current?.id

beforeEach(() => {
  library.load(lib(['a', 3], ['b', 2]))
  player.repeat = false
  player.shuffle = false
  player.pos = 0
  notice.text = ''
  queue.playAlbum('a', 0)
  fake.reset()
  log.mockClear()
  saveQueue.mockClear()
  savePlace.mockClear()
})

describe('a song ends', () => {
  it('plays the next song', () => {
    fake.on.ended!()
    expect(playing()).toBe('a1')
    expect(fake.calls).toEqual(['load media/a1', 'play'])
  })

  it('carries on with the next album at the end of the list', () => {
    queue.jump(2)
    fake.on.ended!()
    expect(queue.items).toEqual(['a0', 'a1', 'a2', 'b0', 'b1'])
    expect(playing()).toBe('b0')
    expect(queue.from).toBe('Album a')
  })

  it('replays the song with repeat on', () => {
    player.repeat = true
    fake.on.ended!()
    expect(playing()).toBe('a0')
    expect(fake.calls).toEqual(['seek 0', 'play'])
  })
})

describe('previous', () => {
  it('restarts and plays after 3 seconds', () => {
    queue.jump(1)
    fake.reset()
    player.pos = 5
    queue.prev()
    expect(playing()).toBe('a1')
    expect(fake.calls).toEqual(['seek 0', 'play'])
  })

  it('restarts and plays the first song, even when paused', () => {
    player.playing = false
    queue.prev()
    expect(fake.calls).toEqual(['seek 0', 'play'])
    expect(player.playing).toBe(true)
  })

  it('goes one back early in the song', () => {
    queue.jump(1)
    fake.reset()
    player.pos = 1
    queue.prev()
    expect(playing()).toBe('a0')
    expect(fake.calls).toEqual(['load media/a0', 'play'])
  })
})

describe('a song fails', () => {
  it('is logged and skipped while playing', () => {
    fake.on.error!(bad)
    expect(playing()).toBe('a1')
    expect(fake.calls).toEqual(['load media/a1', 'play'])
    expect(notice.text).toBe('Format can\'t be played, skipped: "A 0"')
    expect(log).toHaveBeenCalledOnce()
  })

  it('says when the file is gone instead of the format', () => {
    fake.on.error!({ ...bad, gone: true })
    expect(playing()).toBe('a1')
    expect(notice.text).toBe('File is gone or can\'t be read, skipped: "A 0"')
    expect(log.mock.calls[0][0]).toContain('(file gone or unreadable)')
  })

  it('stays put when paused, as after a restore', () => {
    queue.restore({ items: ['a0', 'a1'], index: 0, from: 'Album a', pos: 12 })
    fake.reset()
    fake.on.error!(bad)
    expect(playing()).toBe('a0')
    expect(fake.calls).toEqual([])
    expect(notice.text).toBe('Format can\'t be played: "A 0"')
  })

  it('does not add the same album again and again when every song fails', () => {
    // one album only: the "next album" wraps round to itself
    library.load(lib(['a', 3]))
    queue.playAlbum('a', 0)
    for (let i = 0; i < 3; i++) fake.on.error!(bad)
    expect(queue.items).toEqual(['a0', 'a1', 'a2'])
    expect(player.playing).toBe(false)
    expect(notice.text).toBe('Format can\'t be played, stopped at the end of the list: "A 2"')
  })

  it('stops after 20 failures in a row', () => {
    library.load(lib(...Array.from({ length: 30 }, (_, i): [string, number] => [`x${i}`, 1])))
    queue.playAlbum('x0', 0)
    for (let i = 0; i < 20; i++) fake.on.error!(bad)
    expect(player.playing).toBe(false)
    expect(notice.text).toBe('Could not play 20 songs in a row. Stopped.')
    expect(playing()).toBe('x190')
  })

  it('a refused play() is not the song failing', () => {
    fake.on.refused!('NotAllowedError: no')
    expect(playing()).toBe('a0')
    expect(player.playing).toBe(false)
    expect(log).toHaveBeenCalledWith('Playback refused: NotAllowedError: no')
  })
})

describe('the element', () => {
  it('pausing by itself (media keys) shows as paused, and playing again as playing', () => {
    expect(player.playing).toBe(true)
    fake.on.paused!()
    expect(player.playing).toBe(false)
    fake.on.playing!()
    expect(player.playing).toBe(true)
  })
})

describe('a rescan', () => {
  it('moves on to the next song when the current one is gone, still playing', () => {
    queue.jump(1)
    fake.reset()
    const l = lib(['a', 3], ['b', 2])
    l.tracks = l.tracks.filter((t) => t.id !== 'a1')
    l.albums[0].trackIds = ['a0', 'a2']
    library.load(l)
    queue.prune()
    expect(queue.items).toEqual(['a0', 'a2'])
    expect(playing()).toBe('a2')
    expect(fake.calls).toEqual(['load media/a2', 'play'])
  })

  it('leaves the current song alone when others go', () => {
    const l = lib(['a', 3], ['b', 2])
    l.tracks = l.tracks.filter((t) => t.id !== 'a2')
    l.albums[0].trackIds = ['a0', 'a1']
    library.load(l)
    queue.prune()
    expect(queue.items).toEqual(['a0', 'a1'])
    expect(fake.calls).toEqual([])
  })
})

describe('ids that changed', () => {
  it('renames the queue as the library with the new ids loads, and keeps playing', () => {
    queue.jump(1)
    fake.reset()
    saveQueue.mockClear()
    queue.moveIds({ a0: 'n0', a1: 'n1' })
    const l = lib(['a', 3], ['b', 2])
    for (const t of l.tracks) if (t.id === 'a0' || t.id === 'a1') t.id = t.id.replace('a', 'n')
    l.albums[0].trackIds = ['n0', 'n1', 'a2']
    library.load(l)
    queue.prune()
    expect(queue.items).toEqual(['n0', 'n1', 'a2'])
    expect(playing()).toBe('n1')
    expect(fake.calls).toEqual([])
    expect(saveQueue).toHaveBeenCalledTimes(1)
    expect(saveQueue).toHaveBeenLastCalledWith(
      expect.objectContaining({ items: ['n0', 'n1', 'a2'] })
    )
  })

  it('does nothing when no queued song moved', () => {
    queue.moveIds({ zz: 'yy' })
    expect(saveQueue).not.toHaveBeenCalled()
  })
})

describe('saving', () => {
  it('sends the list only when it changes, and the place on every song change', () => {
    fake.on.ended!()
    queue.jump(0)
    queue.next()
    expect(saveQueue).not.toHaveBeenCalled()
    expect(savePlace).toHaveBeenLastCalledWith({ index: 1, pos: 0 })
    // the new song never goes with the old song's position
    player.pos = 50
    savePlace.mockClear()
    queue.next()
    expect(savePlace.mock.calls).toEqual([[{ index: 2, pos: 0 }]])
    queue.playAlbum('b', 1)
    expect(saveQueue).toHaveBeenCalledTimes(1)
    expect(saveQueue).toHaveBeenLastCalledWith({
      items: ['b0', 'b1'],
      index: 1,
      from: 'Album b',
      link: { kind: 'album', id: 'b' },
      pos: 0
    })
  })

  it('sends the whole list with the new index when a rescan drops songs', () => {
    queue.jump(2)
    savePlace.mockClear()
    const l = lib(['a', 3], ['b', 2])
    l.tracks = l.tracks.filter((t) => t.id !== 'a0')
    l.albums[0].trackIds = ['a1', 'a2']
    library.load(l)
    queue.prune()
    expect(saveQueue).toHaveBeenLastCalledWith(expect.objectContaining({ index: 1 }))
  })
})

// A disc image with a cue sheet: three tracks of one file, then a normal album.
function imageLib(): LibraryData {
  const l = lib(['c', 3], ['d', 1])
  const bounds = [0, 100, 250]
  l.tracks.forEach((t) => {
    if (t.albumId !== 'c') return
    const i = t.no - 1
    t.part = { file: 'img', start: bounds[i], end: bounds[i + 1] }
    if (t.part.end === undefined) delete t.part.end
  })
  return l
}

describe('tracks of a disc image', () => {
  beforeEach(() => {
    library.load(imageLib())
    queue.playAlbum('c', 0)
    fake.reset()
  })

  it('load the image by its id, at the track', () => {
    queue.playAlbum('c', 1)
    expect(fake.calls).toEqual(['load media/img 100-250 at 0', 'play'])
  })

  it('run on into the next track with no reload', () => {
    fake.on.ended!()
    expect(playing()).toBe('c1')
    expect(fake.calls).toEqual(['continue 100-250'])
    expect(player.pos).toBe(0)
    expect(savePlace).toHaveBeenLastCalledWith({ index: 1, pos: 0 })
  })

  it('load the next album after the last track', () => {
    queue.jump(2)
    fake.reset()
    fake.on.ended!()
    expect(playing()).toBe('d0')
    expect(fake.calls).toEqual(['load media/d0', 'play'])
  })

  it('load when shuffle picks a track that is not the next one', () => {
    player.shuffle = true
    queue.jump(2)
    fake.reset()
    fake.on.ended!()
    expect(fake.calls[0]).toMatch(/^load media\/img 0-100|^load media\/img 100-250/)
  })

  it('replay the track with repeat on', () => {
    player.repeat = true
    fake.on.ended!()
    expect(fake.calls).toEqual(['seek 0', 'play'])
  })

  it('restart on Previous after 3 seconds of the track, not of the image', () => {
    queue.jump(1)
    fake.reset()
    player.pos = 2
    queue.prev()
    expect(playing()).toBe('c0')
    expect(fake.calls).toEqual(['load media/img 0-100 at 0', 'play'])
  })

  it('come back at the saved place in the track', () => {
    queue.restore({ items: ['c0', 'c1', 'c2'], index: 1, from: 'Album c', pos: 30 })
    expect(fake.calls).toEqual(['load media/img 100-250 at 30'])
  })
})

describe('queue actions (ticket 037)', () => {
  it('Play next puts songs right after the current one, with nothing reloaded', () => {
    queue.playNext(['b0', 'b1'])
    expect(queue.items).toEqual(['a0', 'b0', 'b1', 'a1', 'a2'])
    expect(playing()).toBe('a0')
    expect(fake.calls).toEqual([])
    expect(notice.text).toBe('Playing next: 2 songs')
    expect(saveQueue).toHaveBeenLastCalledWith(expect.objectContaining({ next: 2 }))
  })

  it('Add to queue puts songs at the end', () => {
    queue.append(['b1'])
    expect(queue.items).toEqual(['a0', 'a1', 'a2', 'b1'])
    expect(fake.calls).toEqual([])
    expect(notice.text).toBe('Added to the queue: "B 1"')
  })

  it('an empty queue takes the songs, the first loaded paused', () => {
    queue.clear()
    queue.clear()
    fake.reset()
    queue.append(['b0', 'b1'], 'Album b')
    expect(queue.items).toEqual(['b0', 'b1'])
    expect(queue.from).toBe('Album b')
    expect(playing()).toBe('b0')
    expect(fake.calls).toEqual(['load media/b0'])
    expect(player.playing).toBe(false)
  })

  it('keeps what "From" opens, from a list, a menu and the last run (ticket 040)', () => {
    expect(queue.link).toEqual({ kind: 'album', id: 'a' })
    queue.playList(['b0'], 0, 'search "b"')
    expect(queue.link).toBeUndefined()
    queue.clear()
    queue.clear()
    queue.playNext(['b0'], 'Mix', { kind: 'playlist', id: 'p1' })
    expect(queue.link).toEqual({ kind: 'playlist', id: 'p1' })
    expect(saveQueue).toHaveBeenLastCalledWith(
      expect.objectContaining({ from: 'Mix', link: { kind: 'playlist', id: 'p1' } })
    )
    queue.restore({ items: ['a1'], index: 0, from: 'X', link: { kind: 'artist', id: 'x' }, pos: 0 })
    expect(queue.link).toEqual({ kind: 'artist', id: 'x' })
  })

  it('removing a row before the current song keeps it playing', () => {
    queue.jump(2)
    fake.reset()
    queue.remove(0)
    expect(queue.items).toEqual(['a1', 'a2'])
    expect(queue.index).toBe(1)
    expect(playing()).toBe('a2')
    expect(fake.calls).toEqual([])
    expect(saveQueue).toHaveBeenLastCalledWith(expect.objectContaining({ index: 1 }))
  })

  it('removing the current song plays the next one', () => {
    queue.remove(0)
    expect(playing()).toBe('a1')
    expect(fake.calls).toEqual(['load media/a1', 'play'])
  })

  it('removing the current song while paused loads the next one paused', () => {
    player.playing = false
    queue.remove(0)
    expect(playing()).toBe('a1')
    expect(fake.calls).toEqual(['load media/a1'])
    expect(player.playing).toBe(false)
  })

  it('removing the playing song in the last row loads the one before, paused', () => {
    queue.jump(2)
    fake.reset()
    queue.remove(2)
    expect(playing()).toBe('a1')
    expect(fake.calls).toEqual(['load media/a1'])
    expect(player.playing).toBe(false)
  })

  it('removing the last song left stops and empties the player', () => {
    queue.playList(['b0'], 0, 'B')
    fake.reset()
    queue.remove(0)
    expect(queue.items).toEqual([])
    expect(queue.current).toBeUndefined()
    expect(fake.calls).toEqual(['clear'])
    expect(player.playing).toBe(false)
  })

  it('moving rows past the current song keeps it playing', () => {
    queue.jump(1)
    fake.reset()
    queue.move(2, 0)
    expect(queue.items).toEqual(['a2', 'a0', 'a1'])
    expect(queue.index).toBe(2)
    expect(playing()).toBe('a1')
    queue.move(2, 0)
    expect(queue.index).toBe(0)
    expect(playing()).toBe('a1')
    expect(fake.calls).toEqual([])
  })

  it('Play next on a queue row moves it up to play next', () => {
    queue.playRowNext(2)
    expect(queue.items).toEqual(['a0', 'a2', 'a1'])
    expect(notice.text).toBe('Playing next: "A 2"')
    fake.on.ended!()
    expect(playing()).toBe('a2')
  })

  it('Play next on the row right after the current one still plays it first with shuffle', () => {
    player.shuffle = true
    queue.playRowNext(1)
    expect(queue.items).toEqual(['a0', 'a1', 'a2'])
    expect(savePlace).toHaveBeenLastCalledWith({ index: 0, pos: 0, next: 1 })
    fake.on.ended!()
    expect(playing()).toBe('a1')
  })

  it('clear while playing keeps the song playing; a second clear stops it', () => {
    queue.jump(1)
    fake.reset()
    queue.clear()
    expect(queue.items).toEqual(['a1'])
    expect(playing()).toBe('a1')
    expect(fake.calls).toEqual([])
    expect(notice.text).toBe('Cleared the queue')
    queue.clear()
    expect(queue.items).toEqual([])
    expect(queue.from).toBe('')
    expect(fake.calls).toEqual(['clear'])
    expect(player.playing).toBe(false)
  })

  it('shuffle plays Play next songs first, in order', () => {
    player.shuffle = true
    queue.playNext(['b1'])
    queue.playNext(['b0'])
    fake.on.ended!()
    expect(playing()).toBe('b0')
    queue.next()
    expect(playing()).toBe('b1')
    expect(savePlace).toHaveBeenLastCalledWith({ index: 2, pos: 0 })
  })

  it('repeat replays the current song; Play next songs wait for Next', () => {
    player.repeat = true
    queue.playNext(['b0'])
    fake.reset()
    fake.on.ended!()
    expect(playing()).toBe('a0')
    expect(fake.calls).toEqual(['seek 0', 'play'])
    queue.next()
    expect(playing()).toBe('b0')
  })

  it('sends the Play next count with the place', () => {
    queue.playNext(['b0', 'b1'])
    queue.next()
    expect(savePlace).toHaveBeenLastCalledWith({ index: 1, pos: 0, next: 1 })
  })

  it('comes back with the Play next songs after a restart', () => {
    queue.restore({ items: ['a0', 'b0', 'a1', 'a2'], index: 0, from: 'X', pos: 3, next: 1 })
    player.shuffle = true
    fake.on.ended!()
    expect(playing()).toBe('b0')
  })

  it('counts a new song start, not an edit, for the queue to scroll to', () => {
    const before = queue.starts
    queue.playNext(['b0'])
    queue.move(2, 0)
    queue.remove(0)
    expect(queue.starts).toBe(before)
    queue.next()
    expect(queue.starts).toBe(before + 1)
  })

  it('while radio plays, a new song goes in the queue and nothing loads', () => {
    queue.clear()
    queue.clear()
    fake.reset()
    queue.active = false
    queue.append(['b0'])
    queue.active = true
    expect(queue.items).toEqual(['b0'])
    expect(fake.calls).toEqual([])
  })
})
