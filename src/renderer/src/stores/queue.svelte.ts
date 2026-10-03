// The list you played from, and the song playing from it. See work/specs/queue.md.
// The moves are plain functions in queue/logic.ts; this store plays what they
// pick. It knows songs by item key only: each one's plugin says what it is and
// how to play it (plugins/index.ts).
import { moveKeys, type IdMoves } from '../../../shared/id-moves'
import type { ItemKey } from '../../../shared/plugins/items'
import type { QueueLink, QueuePlace, SavedQueue } from '../../../shared/saved-queue'
import { engine, type EngineError, type EngineEvents } from '../audio/engine'
import {
  advance,
  afterFailure,
  append,
  back,
  clearQueue,
  failNotice,
  follows,
  insertNext,
  jump,
  moveRow,
  onEnded,
  passOver,
  prune,
  queueNotice,
  removeRow,
  type NextOptions,
  type QueueState
} from '../queue/logic'
import { infoOf, itemInfo, playItem } from '../plugins'
import type { ItemAnswer, ItemInfo, Playable } from '../plugins/types'
import { notice } from './notice.svelte'
import { play, player, seek as seekSong } from './player.svelte'

// The position goes to main this often while playing (plus on pause, seek and quit).
const savePosEverySec = 5

// Only songs their plugin says are gone leave the queue; off and loading ones stay.
const notMissing = (key: ItemKey): boolean => itemInfo(key).state !== 'missing'
const isOff = (key: ItemKey): boolean => itemInfo(key).state === 'off'

class QueueStore {
  items: ItemKey[] = $state.raw([])
  index = $state(0)
  from = $state('')
  // what "From" opens (ticket 040)
  link: QueueLink | undefined = $state.raw()
  // Play next songs right after the current one (see queue/logic.ts)
  #next = 0
  // Goes up each time a song is loaded, so the queue scrolls to a new song
  // but not when rows only move around it.
  starts = $state(0)
  // The queue ran out (#stopAtEnd): its last song waits at 0:00. The album
  // page's Play then plays the album again, not just that song. Any play,
  // seek or song load clears it; moving or removing other rows does not.
  ended = $state(false)

  // the current song's key; nothing until a song is picked
  current: ItemKey | undefined = $derived(this.items.length ? this.items[this.index] : undefined)
  // what its plugin says about it
  currentState: ItemAnswer | undefined = $derived(this.current && itemInfo(this.current))
  // its title, picture and colors, while it can be drawn as itself
  currentInfo: ItemInfo | undefined = $derived(
    this.currentState?.state === 'ok' ? this.currentState.info : undefined
  )

  // False while radio has the player (ticket 027): the queue waits with its
  // list and place, and a library change must not load a song.
  active = true
  // Called whenever the user plays from the queue or the library: takes the
  // player back from radio, and makes sure queue.json says the queue plays.
  // playing.svelte.ts sets it.
  takeOver: () => void = () => {}

  #fails = 0
  #savedPos = 0
  // what the engine has: the song and how it plays, for the gapless carry-on
  #loaded: { key: ItemKey; p: Playable } | undefined
  // The current song could not load: its plugin has no data for it yet, or
  // it is off with no other song to go on to. It loads once it can.
  #waiting: { andPlay: boolean; at: number } | undefined
  // counts loads, so an answer that comes late for an older song is dropped
  #loads = 0

  // The engine's events while the queue has the player (playing.svelte.ts passes them on).
  readonly events: Partial<EngineEvents> = {
    time: (t) => {
      player.pos = t
      if (Math.abs(t - this.#savedPos) >= savePosEverySec) this.savePos()
    },
    duration: (d) => (player.duration = d),
    ended: () => this.#ended(),
    // follow the element, so a pause from media keys or the system shows too
    playing: () => {
      this.#fails = 0
      this.ended = false
      player.playing = true
    },
    paused: () => {
      player.playing = false
      this.savePos()
    },
    refused: (message) => {
      window.playbackApi.log(`Playback refused: ${message}`)
      player.playing = false
    },
    seeked: () => this.savePos(),
    error: (e) => this.#failed(e)
  }

  // The user played something from the queue or the library.
  // True when radio had it, so nothing of the song is loaded.
  #claim(): boolean {
    const fromRadio = !this.active
    this.takeOver()
    return fromRadio
  }

  // The list can hold 50k ids, so it goes to main only when it changes. A new
  // current song alone goes from #start, which always follows, with its position.
  #set(s: QueueState): void {
    const listChanged = s.items !== this.items || s.from !== this.from || s.link !== this.link
    this.items = s.items
    this.index = s.index
    this.from = s.from
    this.link = s.link
    this.#next = s.next ?? 0
    if (listChanged) this.#saveList()
  }

  // Loads the current song at `at` seconds, and plays it if `andPlay`.
  #start(andPlay = true, at = 0): void {
    const key = this.current
    const s = key && itemInfo(key)
    this.starts++
    this.ended = false
    this.#waiting = undefined
    this.#loads++
    player.pos = at
    this.savePos()
    if (!this.active) {
      player.duration = (s?.state === 'ok' && s.info.length) || 0
      return
    }
    if (!key || !s) return this.#unload()
    if (s.state === 'off') return this.#passOver(andPlay, at)
    const p = playItem(key)
    if (!p) {
      // loading (or missing, until the next refresh drops it)
      this.#unload()
      this.#waiting = { andPlay, at }
    } else if (p instanceof Promise) {
      const n = this.#loads
      this.#unload()
      void p.then((r) => {
        if (n !== this.#loads) return
        if (r) this.#load(key, r, at, andPlay)
        else this.#waiting = { andPlay, at }
      })
    } else this.#load(key, p, at, andPlay)
  }

  #load(key: ItemKey, p: Playable, at: number, andPlay: boolean): void {
    this.#loaded = { key, p }
    player.duration = typeof p.length === 'number' ? p.length : 0
    engine.load(p.url, at, p.part)
    if (andPlay) play()
    else player.playing = false
  }

  #unload(): void {
    this.#loaded = undefined
    player.playing = false
    player.duration = 0
    engine.clear()
  }

  // The current song's plugin is off: it is passed over as a failed song is,
  // to the next one that can play. With none, it waits for its plugin.
  #passOver(andPlay: boolean, at: number): void {
    const q = this.#state()
    const s = passOver(q, isOff, (x) => advance(x, this.#nextOptions()))
    if (s !== q) {
      this.#set(s)
      return this.#start(andPlay)
    }
    this.#unload()
    this.#waiting = { andPlay, at }
    const st = itemInfo(q.items[q.index])
    if (andPlay && st.state === 'off') notice.show(`${st.text}: nothing to play`)
  }

  // The new current song is the next part of the file playing (the next
  // track of a disc image): the sound goes on, with no reload and no gap.
  #carryOn(key: ItemKey, p: Playable): void {
    this.starts++
    this.#loads++
    this.#loaded = { key, p }
    player.pos = 0
    player.duration = typeof p.length === 'number' ? p.length : 0
    engine.continueWith(p.part!)
    this.savePos()
  }

  // Replaces the queue with a list of songs and plays the clicked one.
  playList(keys: ItemKey[], index: number, from: string, link?: QueueLink): void {
    if (!keys.length) return
    this.#claim()
    this.#fails = 0
    const s: QueueState = { items: keys, index: Math.min(index, keys.length - 1), from }
    if (link) s.link = link
    this.#set(s)
    this.#start()
  }

  // Clicking a row; the current one starts again. A song whose plugin is off
  // does nothing: it can't play.
  jump(index: number): void {
    const key = this.items[index]
    if (key === undefined || isOff(key)) return
    this.#claim()
    this.#fails = 0
    this.#set(jump(this.#state(), index))
    this.#start()
  }

  // "Play next" from a menu. An empty queue takes the songs, the first one
  // loaded paused; `from` names them then.
  playNext(keys: ItemKey[], from = '', link?: QueueLink): void {
    const s = insertNext(this.#state(), keys, from, link)
    this.#add(s, this.index + 1, queueNotice('next', keys, this.#title(keys)))
  }

  // "Add to queue" from a menu.
  append(keys: ItemKey[], from = '', link?: QueueLink): void {
    const s = append(this.#state(), keys, from, link)
    this.#add(s, this.items.length, queueNotice('add', keys, this.#title(keys)))
  }

  // `at` is where the first added song lands. A queue that ran out moves on
  // to it, loaded paused, so Play plays what was added.
  #add(s: QueueState, at: number, text: string): void {
    if (s.items === this.items) return
    const wasEmpty = !this.items.length
    const moveOn = this.ended && !wasEmpty
    this.#set(moveOn ? jump(s, at) : s)
    if (wasEmpty || moveOn) this.#start(false)
    notice.show(text)
  }

  #title(keys: ItemKey[]): string {
    return infoOf(keys[0])?.title ?? ''
  }

  // "Play next" on a queue row: it moves up to right after the current song.
  playRowNext(i: number): void {
    if (i === this.index || i < 0 || i >= this.items.length) return
    const key = this.items[i]
    if (i === this.index + 1) {
      // already next: it only has to count as a Play next song, for shuffle
      this.#next ||= 1
      this.savePos()
    } else this.move(i, i < this.index ? this.index : this.index + 1)
    notice.show(queueNotice('next', [key], this.#title([key])))
  }

  // Drag or Alt+Up / Alt+Down in the queue. The current song plays on.
  move(from: number, to: number): void {
    this.#set(moveRow(this.#state(), from, to))
  }

  // "Remove from queue". When the current song goes, the one after it loads,
  // playing if it was. With none after, the one before loads paused: it has
  // been heard already.
  remove(i: number): void {
    const wasCurrent = i === this.index
    const q = this.#state()
    const s = removeRow(q, i)
    if (s === q) return
    this.#set(s)
    if (wasCurrent) this.#start(player.playing && s.index === i)
  }

  // The Clear button: all but the current song go, so it plays on. With only
  // that one left, it goes too and the player stops.
  clear(): void {
    if (!this.items.length) return
    this.#set(clearQueue(this.#state()))
    if (!this.items.length) this.#start(false)
    notice.show('Cleared the queue')
  }

  #nextOptions(): NextOptions {
    return { shuffle: player.shuffle }
  }

  // The Next button.
  next(): void {
    if (!this.items.length) return
    this.#claim()
    this.#fails = 0
    this.#move(true)
  }

  #ended(): void {
    const step = onEnded(this.#state(), player.repeat, this.#nextOptions())
    if (step.kind === 'replay') {
      engine.seek(0)
      play()
    } else if (step.kind === 'play') {
      const before = this.#loaded
      this.#set(step.state)
      const key = this.current!
      const p = player.playing && before ? playItem(key) : undefined
      if (p && !(p instanceof Promise) && follows(before?.p, p)) this.#carryOn(key, p)
      else this.#start()
    } else this.#stopAtEnd()
  }

  #move(andPlay: boolean): boolean {
    const before = this.#state()
    const after = advance(before, this.#nextOptions())
    if (after === before) {
      this.#stopAtEnd()
      return false
    }
    this.#set(after)
    this.#start(andPlay)
    return true
  }

  #stop(): void {
    engine.pause()
    player.playing = false
  }

  // The queue ran out. The last song stays, back at 0:00, so Play plays it
  // again from the start and the bar doesn't sit at its full length.
  #stopAtEnd(): void {
    this.#stop()
    engine.seek(0)
    player.pos = 0
    this.savePos()
    this.ended = true
  }

  // The seek bar, arrows and media keys (through playing.seek). Not the
  // engine's seeked event: the seek to 0:00 above sends one too.
  seek(pos: number): void {
    this.ended = false
    seekSong(pos)
  }

  prev(): void {
    if (!this.items.length) return
    const fromRadio = this.#claim()
    const r = back(this.#state(), player.pos)
    if (r.restart && fromRadio) this.#start()
    else if (r.restart) {
      player.pos = 0
      engine.seek(0)
      play()
    } else {
      this.#fails = 0
      // songs whose plugin is off are passed over going back too
      this.#set(passOver(r.state, isOff, (x) => (x.index > 0 ? back(x, 0).state : x)))
      this.#start()
    }
  }

  // A song that won't play (ALAC, WMA, a file that is gone...): log it, say so,
  // and go on to the next one. When paused (a restored queue), stay on it.
  #failed(e: EngineError): void {
    const key = this.current
    if (!key) return
    const title = this.currentInfo?.title ?? ''
    const codec = this.#loaded?.key === key ? this.#loaded.p.codec : undefined
    window.playbackApi.log(
      `Could not play ${key} "${title}" (${codec || 'unknown codec'}): ` +
        `error ${e.code} ${e.message}${e.gone ? ' (file gone or unreadable)' : ''}` +
        (e.first ? `; before ?decode: ${e.first}` : '')
    )
    if (!player.playing) {
      notice.show(failNotice(title, e.gone, 'paused'))
      return
    }
    this.#fails++
    if (afterFailure(this.#fails, this.items.length) === 'stop') {
      notice.show(`Could not play ${this.#fails} songs in a row. Stopped.`)
      this.#fails = 0
      return this.#stop()
    }
    const moved = this.#move(true)
    notice.show(failNotice(title, e.gone, moved ? 'skipped' : 'end'))
  }

  // A plugin's data changed, or one was turned on or off (App.svelte calls
  // this on itemsVersion). Songs their plugin says are gone leave the queue.
  // A current song that waited loads once it can; one whose plugin went off
  // is passed over.
  refresh(): void {
    const before = this.current
    const waiting = this.#waiting
    this.#set(prune(this.#state(), notMissing))
    if (this.current !== before) return this.#start(player.playing || !!waiting?.andPlay)
    if (!this.active || !this.current) return
    const s = itemInfo(this.current).state
    if (waiting && s === 'ok') this.#start(waiting.andPlay, waiting.at)
    else if (s === 'off' && this.#loaded) this.#start(player.playing, player.pos)
  }

  // Songs whose ids changed (see id-moves.ts). They are the same songs, so
  // nothing restarts. Called just before the library with the new ids loads.
  moveIds(moves: IdMoves): void {
    const items = moveKeys(this.items, moves)
    if (items !== this.items) this.#set({ ...this.#state(), items })
  }

  // "Back to queue": the song loaded paused at its place.
  resume(): void {
    this.#start(false, player.pos)
  }

  // The queue from the last run, loaded paused where it was.
  restore(saved: SavedQueue): void {
    const s = prune(saved, notMissing)
    if (!s.items.length) return
    this.items = s.items
    this.index = s.index
    this.from = s.from
    this.link = s.link
    this.#next = s.next ?? 0
    // a different current song means the old one is gone: start it from the top
    const same = s.items[s.index] === saved.items[saved.index]
    this.#start(false, same ? saved.pos : 0)
  }

  #state(): QueueState {
    const s: QueueState = { items: this.items, index: this.index, from: this.from }
    if (this.link) s.link = this.link
    if (this.#next) s.next = this.#next
    return s
  }

  // the position follows right after, from #start
  #saveList(): void {
    window.playbackApi.saveQueue({ ...this.#state(), pos: player.pos })
  }

  // The current song and position, without the list.
  savePos(): void {
    this.#savedPos = player.pos
    const place: QueuePlace = { index: this.index, pos: player.pos }
    if (this.#next) place.next = this.#next
    window.playbackApi.savePlace(place)
  }
}

export const queue = new QueueStore()
