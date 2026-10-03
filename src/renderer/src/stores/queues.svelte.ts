// What plays: the track queue or the live queue (decision 142, spec
// "Queues"). This store owns the engine's events and passes them to the queue
// that plays. NowPlaying, the controls, the media session and the app colors
// read title, sub and art here, from the ItemInfo of what plays.
import type { Art } from '../../../shared/library'
import { itemKey, splitKey, type ItemKey } from '../../../shared/plugins/items'
import type { SavedPlaying, SavedQueues } from '../../../shared/saved-queue'
import { engine, type EngineEvents } from '../audio/engine'
import { barOf, type Bar } from '../queue/bar'
import { actOn, infoOf, isLive, itemInfo, liveOf } from '../plugins'
import type {
  Action,
  Can,
  HistoryEntry,
  ItemInfo,
  LiveHandle,
  LiveStatus,
  Playable
} from '../plugins/types'
import { player, togglePlay as toggleSong } from './player.svelte'
import { queue } from './queue.svelte'

export type Active = 'track' | 'live'

// "Artist · Album", or the one of them there is
function subLine(subtitle: string | undefined, group: string | undefined): string {
  return [subtitle, group].filter(Boolean).join(' · ')
}

// What the system's media controls show.
export interface MediaText {
  title: string
  artist: string
  album: string
}

const eventNames: (keyof EngineEvents)[] = [
  'time',
  'duration',
  'ended',
  'playing',
  'paused',
  'seeked',
  'refused',
  'error',
  'waiting'
]

// A live item (a radio station): it never ends and its plugin drives it. The
// plugin tells what is on air, its recent songs, its status and its actions
// (LiveHandle).
class LiveQueue {
  readonly kind = 'live'
  // the live item, playing or picked and paused
  current: ItemKey | null = $state(null)
  // what is on air; until the plugin says, what the item is
  info: ItemInfo | undefined = $state.raw()
  history: HistoryEntry[] = $state.raw([])
  status: LiveStatus | undefined = $state.raw()
  // the last connection's; none before the first
  playable: { length: number | 'live'; can: Can } | undefined = $state.raw()
  actions: Action[] = $state.raw([])

  // Time listened to this item: ms with sound before, and since when sound
  // comes out. Only while sound comes out, so a reconnect or a buffer doesn't
  // count; Stop keeps it, another item starts from 0 (decision 157).
  #heardMs = $state(0)
  #since: number | undefined = $state()

  listened(now = Date.now()): number {
    // the bar's tick can hold a now from just before the sound started
    return this.#heardMs + (this.#since === undefined ? 0 : Math.max(0, now - this.#since))
  }

  soundStarts(): void {
    this.#since ??= Date.now()
  }

  soundStops(): void {
    this.#heardMs = this.listened()
    this.#since = undefined
  }

  // another item: nothing of the last one stays
  pick(key: ItemKey): void {
    this.current = key
    this.info = undefined
    this.history = []
    this.status = undefined
    this.playable = undefined
    this.actions = []
    this.#heardMs = 0
    this.#since = undefined
  }
}

// The engine's events that end the sound of a live item (a buffer, a drop).
const silences = new Set<keyof EngineEvents>(['waiting', 'ended', 'error'])

class Queues {
  readonly track = queue
  readonly live = new LiveQueue()
  active: Active = $state('track')

  // the ItemInfo of what plays
  info: ItemInfo | undefined = $derived(
    this.active === 'live'
      ? (this.live.info ?? infoOf(this.live.current ?? undefined))
      : queue.currentInfo
  )
  title: string | undefined = $derived(this.info?.title)
  sub: string | undefined = $derived(this.info && subLine(this.info.subtitle, this.info.group))
  art: Art | undefined = $derived(this.info?.art)
  // what the player bar draws for it
  bar: Bar = $derived(
    this.active === 'live'
      ? barOf('live', this.live.playable, this.live.actions)
      : barOf('track', queue.playable, queue.playable?.actions ?? [])
  )
  // Nothing picked: Play, Previous and Next have nothing to act on.
  nothing: boolean = $derived(this.active === 'live' ? !this.live.current : !queue.current)
  // Sound is wanted: the play buttons show Pause (Stop for a live item). Also
  // while a song waits to load and is to play then, so pressing the button
  // says "not now" and doesn't turn the wish around unseen. A live item's
  // player.playing is its wish already, also while its plugin connects.
  wantsSound: boolean = $derived(player.playing || (this.active === 'track' && queue.wantsPlay))
  // A song sounds: the queue's playing marks (the bouncing bars) follow this,
  // not player.playing, which is the live item's wish for sound while it plays.
  songPlaying: boolean = $derived(this.active === 'track' && player.playing)
  // The track queue's song, only while it plays: the playing marks in lists
  // (the row tint, the bars on a tile) follow this, so none show for a live item.
  item: ItemKey | undefined = $derived(this.active === 'track' ? queue.current : undefined)
  media: MediaText | undefined = $derived(
    this.info && {
      title: this.info.title,
      artist: this.info.mediaArtist ?? this.info.subtitle ?? '',
      album: this.info.group ?? ''
    }
  )

  // what queue.json says plays: 'track' or 'live:<key>'
  #saved = ''
  // counts live plays, resumes and pauses, so a late playable is dropped
  #opens = 0

  isItem(key: ItemKey): boolean {
    return this.item === key
  }

  constructor() {
    const route: Partial<EngineEvents> = {}
    for (const name of eventNames) {
      route[name] = ((...args: unknown[]) => {
        if (this.active === 'track') return call(queue.events, name, args)
        // A pause of the element itself (the system's audio) is passed on
        // only while it holds: our own pauses leave no source (a reconnect,
        // a new item) or are followed by a new play before this comes.
        if (name === 'paused' && (!engine.loaded || !engine.el.paused)) return
        if (name === 'playing') this.live.soundStarts()
        else if (silences.has(name)) this.live.soundStops()
        call(this.#liveEvents(), name, args)
      }) as never
    }
    engine.on(route)
    queue.takeOver = () => this.#toTrack()
  }

  #liveEvents(): Partial<EngineEvents> {
    const l = this.live.current && liveOf(this.live.current)
    return l ? l.plugin.events(l.id) : {}
  }

  // Plays an item by its plugin's kind: a track item through the track
  // queue's list, a live one here.
  playItem(key: ItemKey): Promise<void> | void {
    if (isLive(key)) return this.playLive(key)
    queue.playList([key], 0, '')
  }

  // A live item takes the player; the track queue keeps its list and place.
  async playLive(key: ItemKey): Promise<void> {
    const l = liveOf(key)
    if (!l || itemInfo(key).state !== 'ok') return
    const was = this.live.current
    if (this.active === 'track') {
      queue.savePos()
      queue.active = false
    } else if (was && was !== key) {
      // another live plugin's item stops; one plugin switches items itself
      const old = liveOf(was)
      if (old && old.plugin !== l.plugin) old.plugin.pause(old.id)
    }
    this.active = 'live'
    this.#setCurrent(key)
    this.#save({ active: 'live', current: key })
    await this.#open(key, () => l.plugin.play(l.id, this.#handle(key)))
  }

  // Play after pause: the plugin opens a new connection.
  async #resume(): Promise<void> {
    const key = this.live.current
    const l = key && liveOf(key)
    if (!l || itemInfo(key).state !== 'ok') return
    await this.#open(key, () => l.plugin.resume(l.id))
  }

  // Sound is wanted from the call on; the playable comes later, unless
  // something else was asked for meanwhile.
  async #open(key: ItemKey, start: () => Promise<Playable | undefined>): Promise<void> {
    const n = ++this.#opens
    player.playing = true
    let p: Playable | undefined
    try {
      p = await start()
    } catch (e) {
      window.playbackApi.log(`Could not get ${key} to play: ${e}`)
    }
    if (n !== this.#opens || this.active !== 'live' || this.live.current !== key) return
    if (p) this.#handle(key).load(p)
    else player.playing = false
  }

  // The plugin's way to the player. Calls about an item that is no longer the
  // live queue's are dropped; the engine is touched only while it plays.
  #handle(key: ItemKey): LiveHandle {
    const mine = (): boolean => this.live.current === key
    const plays = (): boolean => mine() && this.active === 'live'
    return {
      load: (p) => {
        if (!plays()) return
        this.live.soundStops()
        this.live.playable = p
        engine.load(p.url, 0, p.part, { live: p.length === 'live' })
        engine.play()
      },
      clear: () => {
        if (!plays()) return
        this.live.soundStops()
        engine.clear()
      },
      // the element keeps its source, paused: with none Chromium drops the
      // system's media controls
      stopped: () => {
        if (!plays()) return
        this.live.soundStops()
        player.playing = false
        engine.pause()
      },
      history: (list) => {
        if (mine()) this.live.history = list
      },
      status: (st) => {
        if (mine()) this.live.status = st
      },
      info: (info) => {
        if (mine()) this.live.info = info
      },
      actions: (list) => {
        if (mine()) this.live.actions = list
      }
    }
  }

  #setCurrent(key: ItemKey): void {
    if (key !== this.live.current) this.live.pick(key)
  }

  #pauseLive(): void {
    this.#opens++
    this.live.soundStops()
    const l = this.live.current && liveOf(this.live.current)
    l?.plugin.pause(l.id)
    player.playing = false
  }

  // One of the bar's actions was used: the item that plays hears it. Only
  // one the bar offers, and not while it is at work.
  act(actionId: string, value?: string): void {
    const key = this.active === 'live' ? this.live.current : queue.current
    const a = [...this.bar.buttons, ...this.bar.choices].find((x) => x.id === actionId)
    if (!key || !a || (a.kind === 'button' && a.busy)) return
    actOn(key, actionId, value)
  }

  // "Back to queue": the queue's song, loaded paused at its place.
  backToQueue(): void {
    const was = this.active
    this.#toTrack()
    if (was === 'live') queue.resume()
  }

  // Also when the track queue already has the player: after a start that
  // could not read the live plugin's data, queue.json still says live until
  // a song is played.
  #toTrack(): void {
    if (this.active === 'track') return this.#save({ active: 'track' })
    this.#pauseLive()
    this.active = 'track'
    queue.active = true
    this.#save({ active: 'track' })
  }

  // Play and pause for the play button, the Space key and the media keys.
  // A live item's pause drops the connection; play opens a new one.
  togglePlay(): void {
    if (this.active === 'track') {
      if (!queue.playWhenReady()) toggleSong()
      return
    }
    if (player.playing) this.#pauseLive()
    else void this.#resume()
  }

  // A live item's new connection can be waited for.
  play(): Promise<void> | void {
    if (this.active === 'live') {
      if (!player.playing) return this.#resume()
    } else if (!player.playing && !queue.playWhenReady(true)) toggleSong()
  }

  pause(): void {
    if (this.active === 'live') this.#pauseLive()
    else if (player.playing) toggleSong()
    else queue.playWhenReady(false)
  }

  // A live item can't be sought, and player.pos is the track queue's place
  // while it plays.
  seek(pos: number): void {
    if (this.active === 'track') queue.seek(pos)
  }

  // Next and Previous: songs in the track queue, or what the live plugin
  // gives (radio: My stations).
  async next(): Promise<void> {
    if (this.active === 'track') return queue.next()
    await this.#step(1)
  }

  async prev(): Promise<void> {
    if (this.active === 'track') return queue.prev()
    await this.#step(-1)
  }

  async #step(by: 1 | -1): Promise<void> {
    const key = this.live.current
    const l = key && liveOf(key)
    if (!l || itemInfo(key).state !== 'ok') return
    const id = by > 0 ? l.plugin.next(l.id) : l.plugin.previous(l.id)
    if (id !== undefined) await this.playLive(itemKey(splitKey(key)!.plugin, id))
  }

  // A plugin's data changed, or one was turned on or off (App.svelte calls
  // this on itemsVersion). A live item whose plugin went off gives the player
  // back to the track queue, paused at its place.
  refresh(): void {
    queue.refresh()
    const key = this.live.current
    if (this.active === 'live' && key && itemInfo(key).state === 'off') this.backToQueue()
  }

  // After a restart: a live item comes back picked and paused. One its plugin
  // says is gone, or whose plugin is off, gives the track queue back. One
  // whose plugin has no data yet (radio could not read My stations) is not
  // forgotten in queue.json: it comes back when the data can be read.
  restore(saved: SavedQueues): void {
    const key = saved.active === 'live' ? saved.live.current : null
    this.#saved = key ? `live:${key}` : 'track'
    const l = key && liveOf(key)
    const state = key && itemInfo(key).state
    if (key && l && state === 'ok') {
      this.active = 'live'
      queue.active = false
      this.#setCurrent(key)
      l.plugin.show(l.id, this.#handle(key))
    } else if (key && state !== 'loading') {
      this.#save({ active: 'track' })
    }
    queue.restore(saved.track)
  }

  #save(p: SavedPlaying): void {
    const key = p.active === 'live' ? `live:${p.current}` : 'track'
    if (key === this.#saved) return
    this.#saved = key
    window.playbackApi.savePlaying(p)
  }
}

function call(events: Partial<EngineEvents>, name: keyof EngineEvents, args: unknown[]): void {
  ;(events[name] as ((...a: unknown[]) => void) | undefined)?.(...args)
}

export const queues = new Queues()
