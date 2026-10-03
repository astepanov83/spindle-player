// The queue store with a fake engine and a fake plugin: what it plays after
// an end, a failure, Previous and a change in the plugin's data. It knows
// songs only by what plugins/index.ts answers (ticket 056).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EngineError, EngineEvents } from '../audio/engine'
import type { ItemKey } from '../../../shared/plugins/items'
import { queueLink } from '../../../shared/saved-queue'
import type { ItemAnswer, ItemInfo, Playable, PlayablePart } from '../plugins/types'

const fake = vi.hoisted(() => ({
  on: {} as Partial<EngineEvents>,
  loaded: false,
  calls: [] as string[],
  reset() {
    this.calls = []
  }
}))

vi.mock('../audio/engine', () => ({
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

// The fake plugins: songs by key, plugins that are off, plugins whose data is
// not in yet (a song they don't have is loading then, not missing).
const plugin = vi.hoisted(() => ({
  songs: new Map<string, { info: ItemInfo; part?: PlayablePart }>(),
  off: new Set<string>(),
  loading: new Set<string>(),
  // answers come later, as radio's will
  later: false,
  pending: [] as (() => void)[],
  // the next later answer fails with this
  reject: undefined as Promise<never> | undefined
}))

vi.mock('../plugins', () => {
  const answer = (key: string): ItemAnswer => {
    const p = key.slice(0, key.indexOf(':'))
    if (plugin.off.has(p)) return { state: 'off', text: `${p} is off` }
    const s = plugin.songs.get(key)
    if (s) return { state: 'ok', info: s.info }
    return { state: plugin.loading.has(p) ? 'loading' : 'missing' }
  }
  const playable = (key: string): Playable | undefined => {
    const s = answer(key).state === 'ok' ? plugin.songs.get(key) : undefined
    if (!s) return undefined
    const p: Playable = {
      url: `media/${s.part?.file ?? key.slice(key.indexOf(':') + 1)}`,
      length: s.info.length ?? 0,
      can: { seek: true, pause: true, next: true, previous: true }
    }
    if (s.part) p.part = s.part
    return p
  }
  return {
    itemInfo: answer,
    infoOf: (key: string | undefined) => {
      const a = key ? answer(key) : undefined
      return a?.state === 'ok' ? a.info : undefined
    },
    playItem: (key: string) => {
      if (!plugin.later) return playable(key)
      if (plugin.reject) return plugin.reject
      return new Promise((done) => plugin.pending.push(() => done(playable(key))))
    }
  }
})

const log = vi.fn()
const saveQueue = vi.fn()
const savePlace = vi.fn()
vi.stubGlobal('window', { playbackApi: { log, saveQueue, savePlace } })

const { queue } = await import('./queue.svelte')
// playing.svelte.ts passes the engine's events on; here they go to the queue straight
Object.assign(fake.on, queue.events)
const { player } = await import('./player.svelte')
const { notice } = await import('./notice.svelte')

// Albums of `n` songs, keys "<plugin>:<album><i>", titles "<ALBUM> <i>".
function songs(album: string, n: number, of = 'files'): ItemKey[] {
  return Array.from({ length: n }, (_, i) => {
    const key = `${of}:${album}${i}` as ItemKey
    plugin.songs.set(key, { info: { title: `${album.toUpperCase()} ${i}`, length: 100 } })
    return key
  })
}

const albums: Record<string, ItemKey[]> = {}

function setSongs(...list: [string, number, string?][]): void {
  plugin.songs.clear()
  for (const [a, n, of] of list) albums[a] = songs(a, n, of)
}

function playAlbum(a: string, index: number): void {
  queue.playList(albums[a], index, `Album ${a}`, queueLink('album', a))
}

const k = (...ids: string[]): ItemKey[] => ids.map((id) => `files:${id}` as ItemKey)

// a song leaves the plugin's data
const drop = (key: string): boolean => plugin.songs.delete(key)

const bad: EngineError = { code: 4, message: 'no supported streams', gone: false }
const playing = (): string | undefined => queue.current?.slice(queue.current.indexOf(':') + 1)

beforeEach(() => {
  plugin.off.clear()
  plugin.loading.clear()
  plugin.later = false
  plugin.pending = []
  plugin.reject = undefined
  setSongs(['a', 3], ['b', 2])
  player.repeat = false
  player.shuffle = false
  player.pos = 0
  notice.text = ''
  playAlbum('a', 0)
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

  it('stops at the end of the queue, the last song back at 0:00', () => {
    queue.jump(2)
    fake.reset()
    player.pos = 100
    fake.on.ended!()
    expect(queue.items).toEqual(['files:a0', 'files:a1', 'files:a2'])
    expect(playing()).toBe('a2')
    expect(player.playing).toBe(false)
    expect(player.pos).toBe(0)
    expect(fake.calls).toEqual(['pause', 'seek 0'])
    expect(savePlace).toHaveBeenLastCalledWith({ index: 2, pos: 0 })
  })

  it('Next on the last song stops the same way', () => {
    queue.jump(2)
    fake.reset()
    player.pos = 40
    queue.next()
    expect(playing()).toBe('a2')
    expect(player.playing).toBe(false)
    expect(player.pos).toBe(0)
  })

  it('marks the queue as ended until something plays, seeks or another song is current', () => {
    queue.jump(2)
    expect(queue.ended).toBe(false)
    fake.on.ended!()
    expect(queue.ended).toBe(true)
    // the seek to 0:00 that stopping sends does not count
    fake.on.seeked!()
    expect(queue.ended).toBe(true)
    fake.on.playing!()
    expect(queue.ended).toBe(false)

    queue.next()
    expect(queue.ended).toBe(true)
    queue.seek(10)
    expect(queue.ended).toBe(false)

    queue.next()
    queue.jump(0)
    expect(queue.ended).toBe(false)

    queue.jump(2)
    queue.next()
    queue.append(k('b0'))
    expect(queue.ended).toBe(false)

    queue.next()
    playAlbum('a', 0)
    expect(queue.ended).toBe(false)
  })

  it('stays ended when rows move or an earlier row goes (the song is the same)', () => {
    queue.jump(2)
    fake.on.ended!()
    queue.move(0, 1)
    expect(queue.ended).toBe(true)
    queue.move(2, 0)
    expect(queue.ended).toBe(true)
    queue.remove(1)
    expect(playing()).toBe('a2')
    expect(queue.ended).toBe(true)
  })

  it('Add to queue after the end moves on to the first added song, paused', () => {
    queue.jump(2)
    fake.on.ended!()
    fake.reset()
    queue.append(k('b0', 'b1'))
    expect(queue.items).toEqual(['files:a0', 'files:a1', 'files:a2', 'files:b0', 'files:b1'])
    expect(playing()).toBe('b0')
    expect(queue.ended).toBe(false)
    expect(player.playing).toBe(false)
    expect(fake.calls).toEqual(['load media/b0'])
    expect(savePlace).toHaveBeenLastCalledWith({ index: 3, pos: 0 })
  })

  it('Play next after the end moves on to the first added song, paused', () => {
    queue.jump(2)
    fake.on.ended!()
    fake.reset()
    queue.playNext(k('b0', 'b1'))
    expect(queue.items).toEqual(['files:a0', 'files:a1', 'files:a2', 'files:b0', 'files:b1'])
    expect(playing()).toBe('b0')
    expect(queue.ended).toBe(false)
    expect(player.playing).toBe(false)
    expect(fake.calls).toEqual(['load media/b0'])
    // b1 is still a Play next song
    expect(savePlace).toHaveBeenLastCalledWith({ index: 3, pos: 0, next: 1 })
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
    queue.restore({ items: ['files:a0', 'files:a1'], index: 0, from: 'Album a', pos: 12 })
    fake.reset()
    fake.on.error!(bad)
    expect(playing()).toBe('a0')
    expect(fake.calls).toEqual([])
    expect(notice.text).toBe('Format can\'t be played: "A 0"')
  })

  it('stops at the end of the queue when every song fails', () => {
    playAlbum('a', 0)
    for (let i = 0; i < 3; i++) fake.on.error!(bad)
    expect(queue.items).toEqual(['files:a0', 'files:a1', 'files:a2'])
    expect(player.playing).toBe(false)
    expect(notice.text).toBe('Format can\'t be played, stopped at the end of the list: "A 2"')
  })

  it('stops after 20 failures in a row', () => {
    setSongs(['x', 30])
    playAlbum('x', 0)
    for (let i = 0; i < 20; i++) fake.on.error!(bad)
    expect(player.playing).toBe(false)
    expect(notice.text).toBe('Could not play 20 songs in a row. Stopped.')
    expect(playing()).toBe('x19')
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
    drop('files:a1')
    queue.refresh()
    expect(queue.items).toEqual(['files:a0', 'files:a2'])
    expect(playing()).toBe('a2')
    expect(fake.calls).toEqual(['load media/a2', 'play'])
  })

  it('leaves the current song alone when others go', () => {
    drop('files:a2')
    queue.refresh()
    expect(queue.items).toEqual(['files:a0', 'files:a1'])
    expect(fake.calls).toEqual([])
  })
})

describe('ids that changed', () => {
  it('renames the queue as the library with the new ids loads, and keeps playing', () => {
    queue.jump(1)
    fake.reset()
    saveQueue.mockClear()
    queue.moveIds({ a0: 'n0', a1: 'n1' })
    setSongs(['a', 3], ['b', 2], ['n', 2])
    drop('files:a0')
    drop('files:a1')
    queue.refresh()
    expect(queue.items).toEqual(['files:n0', 'files:n1', 'files:a2'])
    expect(playing()).toBe('n1')
    expect(fake.calls).toEqual([])
    expect(saveQueue).toHaveBeenCalledTimes(1)
    expect(saveQueue).toHaveBeenLastCalledWith(
      expect.objectContaining({ items: ['files:n0', 'files:n1', 'files:a2'] })
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
    playAlbum('b', 1)
    expect(saveQueue).toHaveBeenCalledTimes(1)
    expect(saveQueue).toHaveBeenLastCalledWith({
      items: ['files:b0', 'files:b1'],
      index: 1,
      from: 'Album b',
      link: queueLink('album', 'b'),
      pos: 0
    })
  })

  it('sends the whole list with the new index when a rescan drops songs', () => {
    queue.jump(2)
    savePlace.mockClear()
    drop('files:a0')
    queue.refresh()
    expect(saveQueue).toHaveBeenLastCalledWith(expect.objectContaining({ index: 1 }))
  })
})

// A disc image with a cue sheet: three parts of one file, then a normal album.
// The carry-on comes from the playables' parts alone.
function imageSongs(): void {
  setSongs(['c', 3], ['d', 1])
  const bounds = [0, 100, 250]
  albums.c.forEach((key, i) => {
    const part: PlayablePart = { file: 'img', start: bounds[i] }
    if (bounds[i + 1] !== undefined) part.end = bounds[i + 1]
    plugin.songs.get(key)!.part = part
  })
}

describe('tracks of a disc image', () => {
  beforeEach(() => {
    imageSongs()
    playAlbum('c', 0)
    fake.reset()
  })

  it('load the image by its id, at the track', () => {
    playAlbum('c', 1)
    expect(fake.calls).toEqual(['load media/img 100-250 at 0', 'play'])
  })

  it('run on into the next track with no reload', () => {
    fake.on.ended!()
    expect(playing()).toBe('c1')
    expect(fake.calls).toEqual(['continue 100-250'])
    expect(player.pos).toBe(0)
    expect(savePlace).toHaveBeenLastCalledWith({ index: 1, pos: 0 })
  })

  it('stop after the last track, back at its start', () => {
    queue.jump(2)
    fake.reset()
    fake.on.ended!()
    expect(playing()).toBe('c2')
    expect(fake.calls).toEqual(['pause', 'seek 0'])
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
    queue.restore({
      items: ['files:c0', 'files:c1', 'files:c2'],
      index: 1,
      from: 'Album c',
      pos: 30
    })
    expect(fake.calls).toEqual(['load media/img 100-250 at 30'])
  })
})

describe('queue actions (ticket 037)', () => {
  it('Play next puts songs right after the current one, with nothing reloaded', () => {
    queue.playNext(k('b0', 'b1'))
    expect(queue.items).toEqual(['files:a0', 'files:b0', 'files:b1', 'files:a1', 'files:a2'])
    expect(playing()).toBe('a0')
    expect(fake.calls).toEqual([])
    expect(notice.text).toBe('Playing next: 2 songs')
    expect(saveQueue).toHaveBeenLastCalledWith(expect.objectContaining({ next: 2 }))
  })

  it('Add to queue puts songs at the end', () => {
    queue.append(k('b1'))
    expect(queue.items).toEqual(['files:a0', 'files:a1', 'files:a2', 'files:b1'])
    expect(fake.calls).toEqual([])
    expect(notice.text).toBe('Added to the queue: "B 1"')
  })

  it('an empty queue takes the songs, the first loaded paused', () => {
    queue.clear()
    queue.clear()
    fake.reset()
    queue.append(k('b0', 'b1'), 'Album b')
    expect(queue.items).toEqual(['files:b0', 'files:b1'])
    expect(queue.from).toBe('Album b')
    expect(playing()).toBe('b0')
    expect(fake.calls).toEqual(['load media/b0'])
    expect(player.playing).toBe(false)
  })

  it('keeps what "From" opens, from a list, a menu and the last run (ticket 040)', () => {
    expect(queue.link).toEqual(queueLink('album', 'a'))
    queue.playList(k('b0'), 0, 'search "b"')
    expect(queue.link).toBeUndefined()
    queue.clear()
    queue.clear()
    queue.playNext(k('b0'), 'Mix', queueLink('playlist', 'p1'))
    expect(queue.link).toEqual(queueLink('playlist', 'p1'))
    expect(saveQueue).toHaveBeenLastCalledWith(
      expect.objectContaining({ from: 'Mix', link: queueLink('playlist', 'p1') })
    )
    queue.restore({
      items: ['files:a1'],
      index: 0,
      from: 'X',
      link: queueLink('artist', 'x'),
      pos: 0
    })
    expect(queue.link).toEqual(queueLink('artist', 'x'))
  })

  it('mixes songs of two plugins (ticket 055)', () => {
    setSongs(['a', 3], ['e', 2, 'mfp'])
    playAlbum('e', 1)
    expect(queue.items).toEqual(['mfp:e0', 'mfp:e1'])
    expect(playing()).toBe('e1')
    queue.append(k('a0'))
    expect(queue.items).toEqual(['mfp:e0', 'mfp:e1', 'files:a0'])
    fake.on.ended!()
    expect(queue.current).toBe('files:a0')
  })

  it('moves only files keys when ids change', () => {
    setSongs(['a', 3], ['e', 2, 'mfp'])
    queue.restore({ items: ['files:a0', 'mfp:e0', 'files:a2'], index: 0, from: 'X', pos: 0 })
    // the same ids from a files rescan: only the files key moves
    queue.moveIds({ a0: 'n0', e0: 'n1' })
    expect(queue.items).toEqual(['files:n0', 'mfp:e0', 'files:a2'])
  })

  it('removing a row before the current song keeps it playing', () => {
    queue.jump(2)
    fake.reset()
    queue.remove(0)
    expect(queue.items).toEqual(['files:a1', 'files:a2'])
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
    queue.playList(k('b0'), 0, 'B')
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
    expect(queue.items).toEqual(['files:a2', 'files:a0', 'files:a1'])
    expect(queue.index).toBe(2)
    expect(playing()).toBe('a1')
    queue.move(2, 0)
    expect(queue.index).toBe(0)
    expect(playing()).toBe('a1')
    expect(fake.calls).toEqual([])
  })

  it('Play next on a queue row moves it up to play next', () => {
    queue.playRowNext(2)
    expect(queue.items).toEqual(['files:a0', 'files:a2', 'files:a1'])
    expect(notice.text).toBe('Playing next: "A 2"')
    fake.on.ended!()
    expect(playing()).toBe('a2')
  })

  it('Play next on the row right after the current one still plays it first with shuffle', () => {
    player.shuffle = true
    queue.playRowNext(1)
    expect(queue.items).toEqual(['files:a0', 'files:a1', 'files:a2'])
    expect(savePlace).toHaveBeenLastCalledWith({ index: 0, pos: 0, next: 1 })
    fake.on.ended!()
    expect(playing()).toBe('a1')
  })

  it('clear while playing keeps the song playing; a second clear stops it', () => {
    queue.jump(1)
    fake.reset()
    queue.clear()
    expect(queue.items).toEqual(['files:a1'])
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
    queue.playNext(k('b1'))
    queue.playNext(k('b0'))
    fake.on.ended!()
    expect(playing()).toBe('b0')
    queue.next()
    expect(playing()).toBe('b1')
    expect(savePlace).toHaveBeenLastCalledWith({ index: 2, pos: 0 })
  })

  it('repeat replays the current song; Play next songs wait for Next', () => {
    player.repeat = true
    queue.playNext(k('b0'))
    fake.reset()
    fake.on.ended!()
    expect(playing()).toBe('a0')
    expect(fake.calls).toEqual(['seek 0', 'play'])
    queue.next()
    expect(playing()).toBe('b0')
  })

  it('sends the Play next count with the place', () => {
    queue.playNext(k('b0', 'b1'))
    queue.next()
    expect(savePlace).toHaveBeenLastCalledWith({ index: 1, pos: 0, next: 1 })
  })

  it('comes back with the Play next songs after a restart', () => {
    queue.restore({
      items: ['files:a0', 'files:b0', 'files:a1', 'files:a2'],
      index: 0,
      from: 'X',
      pos: 3,
      next: 1
    })
    player.shuffle = true
    fake.on.ended!()
    expect(playing()).toBe('b0')
  })

  it('counts a new song start, not an edit, for the queue to scroll to', () => {
    const before = queue.starts
    queue.playNext(k('b0'))
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
    queue.append(k('b0'))
    queue.active = true
    expect(queue.items).toEqual(['files:b0'])
    expect(fake.calls).toEqual([])
  })
})

describe('songs of a plugin that is off (ticket 056)', () => {
  beforeEach(() => {
    setSongs(['a', 2], ['e', 2, 'mfp'])
    queue.playList([albums.a[0], ...albums.e, albums.a[1]], 0, 'Mix')
    plugin.off.add('mfp')
    fake.reset()
  })

  it('are passed over at the end of a song and by Next, and stay in the queue', () => {
    fake.on.ended!()
    expect(queue.current).toBe('files:a1')
    expect(fake.calls).toEqual(['load media/a1', 'play'])
    queue.jump(0)
    queue.next()
    expect(queue.current).toBe('files:a1')
    queue.refresh()
    expect(queue.items).toEqual(['files:a0', 'mfp:e0', 'mfp:e1', 'files:a1'])
  })

  it('are passed over going back too', () => {
    queue.jump(3)
    fake.reset()
    queue.prev()
    expect(queue.current).toBe('files:a0')
    expect(fake.calls).toEqual(['load media/a0', 'play'])
  })

  it('do nothing when clicked', () => {
    queue.jump(1)
    expect(queue.current).toBe('files:a0')
    expect(fake.calls).toEqual([])
  })

  it('are passed over by a restore, the next song loaded paused', () => {
    queue.restore({ items: ['mfp:e0', 'files:a1'], index: 0, from: 'Mix', pos: 30 })
    expect(queue.current).toBe('files:a1')
    expect(fake.calls.at(-1)).toBe('load media/a1')
    expect(player.playing).toBe(false)
  })

  it('a song playing when its plugin goes off is passed over, still playing', () => {
    plugin.off.clear()
    queue.jump(1)
    fake.reset()
    plugin.off.add('mfp')
    queue.refresh()
    expect(queue.current).toBe('files:a1')
    expect(fake.calls).toEqual(['load media/a1', 'play'])
    expect(queue.items).toHaveLength(4)
  })

  it('with nothing else to play, waits and loads paused when the plugin is on again', () => {
    queue.playList(albums.e, 0, 'Episode')
    expect(queue.current).toBe('mfp:e0')
    expect(fake.calls).toEqual(['clear'])
    expect(notice.text).toBe('mfp is off: nothing to play')
    fake.reset()
    plugin.off.clear()
    queue.refresh()
    expect(fake.calls).toEqual(['load media/e0'])
    expect(player.playing).toBe(false)
  })

  it('Play pressed in that wait plays once the plugin is on', () => {
    queue.playList(albums.e, 0, 'Episode')
    expect(queue.playWhenReady()).toBe(true)
    fake.reset()
    plugin.off.clear()
    queue.refresh()
    expect(fake.calls).toEqual(['load media/e0', 'play'])
  })

  it('at the end, with only off songs after, the queue stops on the last song that played', () => {
    queue.jump(0)
    queue.remove(3)
    fake.reset()
    fake.on.ended!()
    expect(queue.current).toBe('files:a0')
    expect(queue.ended).toBe(true)
    expect(fake.calls).toEqual(['pause', 'seek 0'])
    // turning the plugin on later starts nothing
    fake.reset()
    plugin.off.clear()
    queue.refresh()
    expect(fake.calls).toEqual([])
    expect(queue.playWhenReady()).toBe(false)
  })

  it('Next with only off songs after stops the same way', () => {
    queue.remove(3)
    fake.reset()
    queue.next()
    expect(queue.current).toBe('files:a0')
    expect(queue.ended).toBe(true)
    expect(fake.calls).toEqual(['pause', 'seek 0'])
  })
})

describe('songs whose plugin has no data yet (ticket 056)', () => {
  it('stay in the queue; the current one loads once the data is in', () => {
    setSongs(['a', 2])
    plugin.songs.clear()
    plugin.loading.add('mfp')
    plugin.loading.add('files')
    queue.restore({ items: ['files:a0', 'mfp:e0', 'files:a1'], index: 0, from: 'X', pos: 30 })
    queue.refresh()
    expect(queue.items).toEqual(['files:a0', 'mfp:e0', 'files:a1'])
    expect(fake.loaded).toBe(false)
    // the music files are in; MFP (just turned on) still has none
    setSongs(['a', 2])
    plugin.loading.delete('files')
    fake.reset()
    queue.refresh()
    expect(queue.items).toEqual(['files:a0', 'mfp:e0', 'files:a1'])
    expect(fake.calls).toEqual(['load media/a0'])
    expect(player.pos).toBe(30)
    // MFP's episodes came, without that one: only now it is gone
    plugin.loading.delete('mfp')
    queue.refresh()
    expect(queue.items).toEqual(['files:a0', 'files:a1'])
  })

  it('only gone songs leave the queue, not off or loading ones', () => {
    setSongs(['a', 3])
    queue.playList(['files:a0', 'mfp:x', 'radio:y', 'files:gone', 'files:a1'] as ItemKey[], 0, 'X')
    plugin.off.add('mfp')
    plugin.loading.add('radio')
    queue.refresh()
    expect(queue.items).toEqual(['files:a0', 'mfp:x', 'radio:y', 'files:a1'])
  })
})

describe('a song that waits for its plugin (ticket 056)', () => {
  beforeEach(() => {
    plugin.loading.add('mfp')
    queue.playList(['files:a0', 'mfp:x'] as ItemKey[], 0, 'X')
    fake.reset()
  })

  it('is not played by a click', () => {
    queue.jump(1)
    expect(queue.current).toBe('files:a0')
    expect(fake.calls).toEqual([])
  })

  it('plays when it loads if Play was pressed while it waited', () => {
    queue.restore({ items: ['mfp:x'], index: 0, from: 'X', pos: 0 })
    expect(queue.playWhenReady(true)).toBe(true)
    plugin.songs.set('mfp:x', { info: { title: 'X', length: 50 } })
    plugin.loading.clear()
    fake.reset()
    queue.refresh()
    expect(fake.calls).toEqual(['load media/x', 'play'])
  })
})

describe('a playable that comes later (ticket 056)', () => {
  it('loads when it comes, unless another song was picked meanwhile', async () => {
    plugin.later = true
    queue.jump(1)
    queue.jump(2)
    expect(fake.calls).toEqual(['clear', 'clear'])
    for (const done of plugin.pending) done()
    await Promise.resolve()
    await Promise.resolve()
    expect(fake.calls).toEqual(['clear', 'clear', 'load media/a2', 'play'])
  })

  it('does not load over radio, which took the player meanwhile', async () => {
    plugin.later = true
    queue.jump(1)
    queue.active = false
    for (const done of plugin.pending) done()
    await Promise.resolve()
    await Promise.resolve()
    queue.active = true
    expect(fake.calls).toEqual(['clear'])
  })

  it('a failed answer is logged, and the song waits to be tried again', async () => {
    plugin.later = true
    plugin.reject = Promise.reject(new Error('no answer'))
    queue.jump(2)
    await Promise.resolve()
    await Promise.resolve()
    expect(log).toHaveBeenCalledWith('Could not get files:a2 to play: Error: no answer')
    plugin.later = false
    plugin.reject = undefined
    fake.reset()
    queue.refresh()
    expect(fake.calls).toEqual(['load media/a2', 'play'])
  })
})
