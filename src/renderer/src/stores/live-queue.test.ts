// The two queues with a fake live plugin and a fake engine (ticket 057): a
// live item takes the player, the track queue keeps its place, Back to queue,
// media keys, and the handle the plugin drives its item with.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EngineEvents } from '../audio/engine'
import type { ItemKey } from '../../../shared/plugins/items'
import type {
  Action,
  ItemAnswer,
  ItemInfo,
  LiveHandle,
  LivePlugin,
  Playable
} from '../plugins/types'

const fake = vi.hoisted(() => ({
  on: {} as Partial<EngineEvents>,
  loaded: false,
  paused: true,
  calls: [] as string[]
}))

vi.mock('../audio/engine', () => ({
  engine: {
    on: (e: Partial<EngineEvents>) => Object.assign(fake.on, e),
    get loaded() {
      return fake.loaded
    },
    el: {
      get paused() {
        return fake.paused
      }
    },
    load: (url: string, at = 0, _part?: unknown, opts?: { live?: boolean }) => {
      fake.loaded = true
      fake.calls.push(`load ${url}${opts?.live ? ' live' : ` at ${at}`}`)
    },
    continueWith: () => {},
    setNext: () => {},
    play: () => {
      fake.paused = false
      fake.calls.push('play')
    },
    pause: () => {
      fake.paused = true
      fake.calls.push('pause')
    },
    seek: (p: number) => fake.calls.push(`seek ${p}`),
    clear: () => {
      fake.loaded = false
      fake.paused = true
      fake.calls.push('clear')
    },
    setVolume: () => {}
  }
}))

// A live plugin that answers when told to: `answer` holds the plays waiting.
const live = vi.hoisted(() => ({
  on: true,
  calls: [] as string[],
  handle: undefined as LiveHandle | undefined,
  waiting: [] as ((p: Playable | undefined) => void)[],
  events: { error: vi.fn(), paused: vi.fn() },
  // its items, in the order Next steps through
  ids: ['one', 'two', 'three'],
  songsLater: false,
  reactive: false
}))

const playable = (id: string, n = 1): Playable => ({
  url: `live/${id}/${n}`,
  length: 'live',
  can: { seek: false, pause: true, next: true, previous: true }
})

vi.mock('../plugins', async () => {
  // what 'files:a' says now: its Like button turns on when used (ticket 058)
  const { SvelteSet } = await import('svelte/reactivity')
  const liked = new SvelteSet<string>()
  const songs: Record<string, ItemInfo> = {
    'files:s0': { title: 'Song 0', length: 100 },
    'files:s1': { title: 'Song 1', length: 100 },
    // a song with an action, and no Next
    'files:a': { title: 'Song A', length: 100 }
  }
  const plugin: LivePlugin = {
    show: (id, h) => {
      live.calls.push(`show ${id}`)
      live.handle = h
    },
    play: (id, h) => {
      live.calls.push(`play ${id}`)
      live.handle = h
      return new Promise((done) => live.waiting.push(done))
    },
    pause: (id) => void live.calls.push(`pause ${id}`),
    resume: (id) => {
      live.calls.push(`resume ${id}`)
      return new Promise((done) => live.waiting.push(done))
    },
    events: () => live.events,
    next: (id) => live.ids[(live.ids.indexOf(id) + 1) % live.ids.length],
    previous: (id) => live.ids[(live.ids.indexOf(id) + 2) % live.ids.length]
  }
  const itemInfo = (key: string): ItemAnswer => {
    if (key.startsWith('radio:')) {
      if (!live.on) return { state: 'off', text: 'Live is off' }
      const id = key.slice(6)
      return live.ids.includes(id)
        ? { state: 'ok', info: { title: `Item ${id}` } }
        : { state: 'missing' }
    }
    const info = songs[key]
    return info ? { state: 'ok', info } : { state: 'missing' }
  }
  return {
    itemInfo,
    infoOf: (key: string | undefined) => {
      const a = key ? itemInfo(key) : undefined
      return a?.state === 'ok' ? a.info : undefined
    },
    playItem: (key: string): Playable | undefined | Promise<Playable | undefined> => {
      const p: Playable | undefined = songs[key]
        ? {
            url: `media/${key.slice(6)}`,
            length: 100,
            can: { seek: true, pause: true, next: key !== 'files:a', previous: true },
            ...(key === 'files:a'
              ? { actions: [{ id: 'like', kind: 'button' as const, label: 'Like' }] }
              : {})
          }
        : undefined
      // a song's playable that comes later
      return live.songsLater ? new Promise((done) => live.waiting.push(() => done(p))) : p
    },
    isLive: (key: string) => key.startsWith('radio:'),
    actOn: (key: string, actionId: string, value?: string) => {
      live.calls.push(`act ${key} ${actionId}${value === undefined ? '' : ` ${value}`}`)
      if (live.reactive && actionId === 'like') liked.add(key)
    },
    canOf: (key: string) =>
      live.reactive && key === 'files:a'
        ? { seek: true, pause: true, next: false, previous: !liked.has(key) }
        : undefined,
    // with live.reactive, 'files:a' says its actions as they are now, and
    // Previous goes once it is liked
    actionsOf: (key: string): Action[] | undefined =>
      live.reactive && key === 'files:a'
        ? [{ id: 'like', kind: 'button', label: 'Like', on: liked.has(key) }]
        : undefined,
    liveOf: (key: string) => (key.startsWith('radio:') ? { plugin, id: key.slice(6) } : undefined)
  }
})

const savePlaying = vi.fn()
const savePlace = vi.fn()
vi.stubGlobal('window', {
  playbackApi: { log: vi.fn(), saveQueue: vi.fn(), savePlace, savePlaying }
})

const { queues } = await import('./queues.svelte')
const { queue } = await import('./queue.svelte')
const { player } = await import('./player.svelte')

const one: ItemKey = 'radio:one'

// the plugin's waiting plays answer, then the core's await goes on
async function answer(p: (i: number) => Playable | undefined): Promise<void> {
  const waiting = live.waiting
  live.waiting = []
  waiting.forEach((done, i) => done(p(i)))
  await Promise.resolve()
  await Promise.resolve()
}

async function playLive(key: ItemKey, id = key.slice(6)): Promise<void> {
  const p = queues.playLive(key)
  await answer(() => playable(id))
  await p
}

beforeEach(async () => {
  live.on = true
  live.songsLater = false
  live.reactive = false
  queues.backToQueue()
  await answer(() => undefined)
  queue.playList(['files:s0', 'files:s1'], 1, 'Mix')
  fake.on.time!(42)
  fake.calls = []
  live.calls = []
  live.events.error.mockClear()
  live.events.paused.mockClear()
  savePlace.mockClear()
  savePlaying.mockClear()
})

describe('a live item takes the player', () => {
  it('the plugin is asked, the core loads its playable, the track queue keeps its place', async () => {
    const p = queues.playLive(one)
    expect(queues.active).toBe('live')
    expect(player.playing).toBe(true)
    expect(savePlace).toHaveBeenCalledWith({ index: 1, pos: 42 })
    expect(savePlaying).toHaveBeenLastCalledWith({ active: 'live', current: one })
    expect(live.calls).toEqual(['play one'])
    expect(fake.calls).toEqual([])
    await answer(() => playable('one'))
    await p
    expect(fake.calls).toEqual(['load live/one/1 live', 'play'])
    expect(queue.items).toEqual(['files:s0', 'files:s1'])
    expect(queue.index).toBe(1)
    // the engine's time is the item's, not the song's
    fake.on.time!(5)
    expect(player.pos).toBe(42)
  })

  it('picks the queue by the plugin’s kind of item', async () => {
    const p = queues.playItem(one)
    expect(queues.active).toBe('live')
    await answer(() => playable('one'))
    await p
    queues.playItem('files:s0')
    expect(queues.active).toBe('track')
    expect(queue.items).toEqual(['files:s0'])
  })

  it('shows what the item is until the plugin says what is on air', async () => {
    await playLive(one)
    expect(queues.title).toBe('Item one')
    live.handle!.info({ title: 'A song', subtitle: 'Item one' })
    live.handle!.history([{ title: 'A song', at: 1, now: true }])
    live.handle!.status({ state: 'connecting', text: 'Connecting' })
    expect(queues.title).toBe('A song')
    expect(queues.sub).toBe('Item one')
    expect(queues.media).toEqual({ title: 'A song', artist: 'Item one', album: '' })
    expect(queues.live.history).toEqual([{ title: 'A song', at: 1, now: true }])
    expect(queues.live.status).toEqual({ state: 'connecting', text: 'Connecting' })
    // no song marks while a live item plays
    expect(queues.item).toBeUndefined()
    expect(queues.songPlaying).toBe(false)
  })

  it('drops what the plugin says about an item that is no longer the live one', async () => {
    await playLive(one)
    const old = live.handle!
    await playLive('radio:two')
    fake.calls = []
    old.info({ title: 'Old' })
    old.load(playable('one', 2))
    old.clear()
    old.stopped()
    expect(queues.title).toBe('Item two')
    expect(fake.calls).toEqual([])
    expect(player.playing).toBe(true)
  })

  it('loads the plugin’s new connections and drops what the engine has on clear', async () => {
    await playLive(one)
    fake.calls = []
    live.handle!.clear()
    live.handle!.load(playable('one', 2))
    expect(fake.calls).toEqual(['clear', 'load live/one/2 live', 'play'])
  })

  it('a stop by the plugin itself pauses the element and keeps its source', async () => {
    await playLive(one)
    fake.calls = []
    live.handle!.stopped()
    expect(player.playing).toBe(false)
    expect(fake.calls).toEqual(['pause'])
  })

  it('stops wanting sound when the plugin has nothing to play', async () => {
    const p = queues.playLive(one)
    await answer(() => undefined)
    await p
    expect(player.playing).toBe(false)
    expect(fake.calls).toEqual([])
  })
})

describe('the engine’s events', () => {
  it('go to the live plugin while its item plays, and to the track queue after', async () => {
    await playLive(one)
    const e = { code: 2, message: 'x', gone: false }
    fake.on.error!(e)
    expect(live.events.error).toHaveBeenCalledWith(e)
    queues.backToQueue()
    fake.on.error!(e)
    expect(live.events.error).toHaveBeenCalledOnce()
  })

  it('pass a pause on only while the element is paused with a source', async () => {
    await playLive(one)
    // the element plays on: a pause from before a new play
    fake.on.paused!()
    // no source: a pause from a reconnect
    fake.loaded = false
    fake.paused = true
    fake.on.paused!()
    expect(live.events.paused).not.toHaveBeenCalled()
    // the system paused it
    fake.loaded = true
    fake.on.paused!()
    expect(live.events.paused).toHaveBeenCalledOnce()
  })
})

describe('Play and Pause', () => {
  it('pause asks the plugin to drop the connection; play asks it to resume', async () => {
    await playLive(one)
    live.calls = []
    queues.togglePlay()
    expect(live.calls).toEqual(['pause one'])
    expect(player.playing).toBe(false)
    const p = queues.play()
    expect(live.calls).toEqual(['pause one', 'resume one'])
    await answer(() => playable('one', 2))
    await p
    expect(fake.calls.at(-2)).toBe('load live/one/2 live')
  })

  it('a pause while the plugin is still asking drops its late answer', async () => {
    const p = queues.playLive(one)
    queues.togglePlay()
    expect(live.calls).toEqual(['play one', 'pause one'])
    await answer(() => playable('one'))
    await p
    expect(fake.calls).toEqual([])
    expect(player.playing).toBe(false)
  })

  it('the button shows the wish while a clicked song is on its way (fix round 1)', async () => {
    live.songsLater = true
    queue.jump(0)
    expect(player.playing).toBe(false)
    expect(queues.wantsSound).toBe(true)
    // pressed as it shows: Pause
    queues.togglePlay()
    expect(queues.wantsSound).toBe(false)
    fake.calls = []
    await answer(() => undefined)
    expect(fake.calls).toEqual(['load media/s0 at 0'])
    expect(queues.wantsSound).toBe(false)
  })

  it('the button shows the wish while a live item connects', async () => {
    const p = queues.playLive(one)
    expect(queues.wantsSound).toBe(true)
    queues.togglePlay()
    expect(queues.wantsSound).toBe(false)
    await answer(() => playable('one'))
    await p
    expect(fake.calls).toEqual([])
  })

  it('seek does nothing to the track queue’s place', async () => {
    await playLive(one)
    queues.seek(90)
    expect(player.pos).toBe(42)
  })
})

describe('Back to queue', () => {
  it('pauses the live item and loads the queue’s song paused at its place', async () => {
    await playLive(one)
    fake.calls = []
    live.calls = []
    queues.backToQueue()
    expect(queues.active).toBe('track')
    expect(live.calls).toEqual(['pause one'])
    expect(fake.calls).toEqual(['load media/s1 at 42'])
    expect(player.playing).toBe(false)
    expect(savePlaying).toHaveBeenLastCalledWith({ active: 'track' })
  })

  it('the live item’s plugin turned off does the same', async () => {
    await playLive(one)
    live.on = false
    queues.refresh()
    expect(queues.active).toBe('track')
    expect(fake.calls.at(-1)).toBe('load media/s1 at 42')
  })
})

describe('media keys', () => {
  it('Next and Previous play what the live plugin gives', async () => {
    await playLive(one)
    live.calls = []
    const next = queues.next()
    await answer(() => playable('two'))
    await next
    expect(live.calls).toEqual(['play two'])
    expect(queues.live.current).toBe('radio:two')
    const prev = queues.prev()
    await answer(() => playable('one'))
    await prev
    expect(queues.live.current).toBe('radio:one')
    expect(savePlaying).toHaveBeenLastCalledWith({ active: 'live', current: one })
    expect(queue.index).toBe(1)
  })
})

describe('after a restart', () => {
  const saved = {
    version: 2 as const,
    track: { items: ['files:s0', 'files:s1'] as ItemKey[], index: 0, from: 'Mix', pos: 9 },
    live: { current: one },
    active: 'live' as const
  }

  it('a live item comes back picked and paused; the track queue waits', () => {
    queues.backToQueue()
    fake.calls = []
    queues.restore(saved)
    expect(queues.active).toBe('live')
    expect(live.calls).toEqual(['show one'])
    expect(fake.calls).toEqual([])
    expect(queues.title).toBe('Item one')
  })

  it('one that is gone gives the track queue back', () => {
    queues.backToQueue()
    fake.calls = []
    queues.restore({ ...saved, live: { current: 'radio:gone' } })
    expect(queues.active).toBe('track')
    expect(fake.calls).toEqual(['load media/s0 at 9'])
    expect(savePlaying).toHaveBeenLastCalledWith({ active: 'track' })
  })
})

describe('the player bar', () => {
  const stream: Action = {
    id: 'stream',
    kind: 'choice',
    label: 'Stream',
    short: '320k',
    options: [
      { id: '0', label: '320 kbps' },
      { id: '1', label: '128 kbps' }
    ],
    picked: '0'
  }
  const save: Action = { id: 'save', kind: 'button', label: 'Save', icon: 'star' }

  it('a live item: LIVE in place of the seek bar, no Next, Previous, Shuffle or Repeat', async () => {
    // another item first, so nothing of an earlier play of this one is left
    await playLive('radio:two')
    const p = queues.playLive(one)
    // before the first connection too
    expect(queues.bar).toMatchObject({ live: true, seek: false, next: false, order: false })
    await answer(() => ({ ...playable('one'), can: { ...playable('one').can, next: false } }))
    await p
    expect(queues.bar).toMatchObject({
      live: true,
      seek: false,
      next: false,
      previous: true,
      order: false
    })
  })

  it('draws the actions the plugin gives, and follows their changes', async () => {
    await playLive(one)
    expect(queues.bar.buttons).toEqual([])
    live.handle!.actions([stream, save])
    expect(queues.bar.choices).toEqual([stream])
    expect(queues.bar.buttons).toEqual([save])
    // saved: the plugin gives Save no more
    live.handle!.actions([{ ...stream, picked: '1' }])
    expect(queues.bar.choices[0].kind === 'choice' && queues.bar.choices[0].picked).toBe('1')
    expect(queues.bar.buttons).toEqual([])
  })

  it('act tells the item’s plugin the action and the option picked', async () => {
    await playLive(one)
    live.handle!.actions([stream, save])
    live.calls = []
    queues.act('stream', '1')
    queues.act('save')
    expect(live.calls).toEqual(['act radio:one stream 1', 'act radio:one save'])
  })

  it('act passes on only an action the bar offers, and not one at work', async () => {
    await playLive(one)
    live.handle!.actions([{ ...save, busy: true }])
    live.calls = []
    queues.act('save')
    queues.act('delete')
    expect(live.calls).toEqual([])
  })

  it('another item starts with no actions, and an old item’s are dropped', async () => {
    await playLive(one)
    const old = live.handle!
    old.actions([save])
    await playLive('radio:two')
    expect(queues.bar.buttons).toEqual([])
    old.actions([save])
    expect(queues.bar.buttons).toEqual([])
  })

  it('a song: seek bar, Shuffle and Repeat, Next and Previous, also while it is on its way', async () => {
    live.songsLater = true
    queue.playList(['files:s0'], 0, '')
    expect(queues.bar).toMatchObject({ live: false, seek: true, next: true, order: true })
    await answer(() => undefined)
    expect(queues.bar).toMatchObject({ live: false, seek: true, next: true, previous: true })
  })

  it('a song’s Next is hidden when it can’t; its actions are drawn and heard', () => {
    queue.playList(['files:a'], 0, '')
    expect(queues.bar).toMatchObject({ seek: true, next: false, previous: true, order: true })
    expect(queues.bar.buttons.map((a) => a.id)).toEqual(['like'])
    live.calls = []
    queues.act('like')
    expect(live.calls).toEqual(['act files:a like'])
  })
})

describe('the player bar while a song changes (fix round 1)', () => {
  it('a clicked song on its way: the default bar, not the last song’s actions', async () => {
    queue.playList(['files:a', 'files:s0'], 0, '')
    expect(queues.bar.buttons.map((a) => a.id)).toEqual(['like'])
    live.songsLater = true
    void queue.next()
    expect(queue.current).toBe('files:s0')
    expect(queues.bar).toMatchObject({ seek: true, next: true, buttons: [] })
    live.calls = []
    // the last song's action is not sent to the new one
    queues.act('like')
    expect(live.calls).toEqual([])
    await answer(() => undefined)
    expect(queues.bar.buttons).toEqual([])
  })

  it('a song whose id moved (a rescan) keeps its playable on the bar', () => {
    queue.playList(['files:a'], 0, '')
    queue.moveIds('files', { a: 'a2' })
    expect(queue.current).toBe('files:a2')
    expect(queues.bar.buttons.map((x) => x.id)).toEqual(['like'])
  })

  it('a song’s can and actions are read as its plugin changes them', () => {
    live.reactive = true
    queue.playList(['files:a'], 0, '')
    expect(queues.bar.buttons).toEqual([{ id: 'like', kind: 'button', label: 'Like', on: false }])
    queues.act('like')
    expect(live.calls).toContain('act files:a like')
    expect(queues.bar.buttons[0]).toMatchObject({ id: 'like', on: true })
    expect(queues.bar.previous).toBe(false)
  })
})

describe('"Nothing playing" (fix round 1)', () => {
  it('a live item picked whose plugin has no data yet still shows its lines', async () => {
    await playLive(one)
    expect(queues.nothingPlaying).toBe(false)
    live.on = false
    // its plugin is off: no title, but the item is still the live one
    expect(queues.title).toBeUndefined()
    expect(queues.nothingPlaying).toBe(false)
  })

  it('the track queue with no song says it', async () => {
    expect(queues.nothingPlaying).toBe(false)
    // Clear keeps the current song; a second Clear takes it too
    queue.clear()
    queue.clear()
    expect(queues.nothingPlaying).toBe(true)
  })
})

describe('the time listened to a live item', () => {
  const at = (): number => Math.round(queues.live.listened() / 1000)

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('counts while sound comes out: not while it connects, buffers or reconnects', async () => {
    await playLive('radio:three')
    await vi.advanceTimersByTimeAsync(3000)
    expect(at()).toBe(0)
    fake.on.playing!()
    await vi.advanceTimersByTimeAsync(5000)
    fake.on.waiting!()
    await vi.advanceTimersByTimeAsync(2000)
    expect(at()).toBe(5)
    fake.on.playing!()
    await vi.advanceTimersByTimeAsync(1000)
    // a new connection
    live.handle!.load(playable('three', 2))
    await vi.advanceTimersByTimeAsync(4000)
    expect(at()).toBe(6)
  })

  it('Stop keeps it and Play goes on; another item starts from 0', async () => {
    await playLive('radio:two')
    fake.on.playing!()
    await vi.advanceTimersByTimeAsync(4000)
    queues.togglePlay()
    await vi.advanceTimersByTimeAsync(9000)
    expect(at()).toBe(4)
    queues.togglePlay()
    await answer(() => playable('two', 2))
    fake.on.playing!()
    await vi.advanceTimersByTimeAsync(1000)
    expect(at()).toBe(5)
    await playLive(one)
    expect(at()).toBe(0)
  })
})
