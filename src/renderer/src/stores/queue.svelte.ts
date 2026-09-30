// The list you played from, and the song playing from it. See work/specs/queue.md.
// The moves are plain functions in queue/logic.ts; this store plays what they pick.
import { moveIds, type IdMoves } from '../../../shared/id-moves'
import type { Album, Art, Track } from '../../../shared/library'
import type { QueueLink, QueuePlace, SavedQueue } from '../../../shared/saved-queue'
import { engine, mediaUrl, type EngineError, type EngineEvents } from '../audio/engine'
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
  prune,
  queueNotice,
  removeRow,
  type NextOptions,
  type QueueState
} from '../queue/logic'
import { library } from './library.svelte'
import { notice } from './notice.svelte'
import { play, player, seek as seekSong } from './player.svelte'

// The position goes to main this often while playing (plus on pause, seek and quit).
const savePosEverySec = 5

class QueueStore {
  items: string[] = $state.raw([])
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

  // nothing until a song is picked
  current: Track | undefined = $derived(
    this.items.length ? library.track(this.items[this.index]) : undefined
  )
  currentAlbum: Album | undefined = $derived(
    this.current ? library.album(this.current.albumId) : undefined
  )
  // the playing song's picture and colors
  currentArt: Art | undefined = $derived(this.current && library.art(this.current))

  // False while radio has the player (ticket 027): the queue waits with its
  // list and place, and a library change must not load a song.
  active = true
  // Called whenever the user plays from the queue or the library: takes the
  // player back from radio, and makes sure queue.json says the queue plays.
  // playing.svelte.ts sets it.
  takeOver: () => void = () => {}

  #fails = 0
  #savedPos = 0

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
    const t = this.current
    this.starts++
    this.ended = false
    player.pos = at
    this.savePos()
    if (!this.active) {
      player.duration = t?.duration ?? 0
      return
    }
    if (!t) {
      player.playing = false
      player.duration = 0
      engine.clear()
      return
    }
    player.duration = t.duration
    engine.load(mediaUrl(t.part?.file ?? t.id), at, t.part)
    if (andPlay) play()
    else player.playing = false
  }

  // The new current song is the next part of the file playing (the next
  // track of a disc image): the sound goes on, with no reload and no gap.
  #carryOn(): void {
    const t = this.current!
    this.starts++
    player.pos = 0
    player.duration = t.duration
    engine.continueWith(t.part!)
    this.savePos()
  }

  // Replaces the queue with a list and plays the clicked song.
  playList(ids: string[], index: number, from: string, link?: QueueLink): void {
    if (!ids.length) return
    this.#claim()
    this.#fails = 0
    const s: QueueState = { items: ids, index: Math.min(index, ids.length - 1), from }
    if (link) s.link = link
    this.#set(s)
    this.#start()
  }

  playAlbum(albumId: string, index: number): void {
    const al = library.album(albumId)
    this.playList(al.trackIds, index, al.title, { kind: 'album', id: al.id })
  }

  // Clicking a row; the current one starts again.
  jump(index: number): void {
    this.#claim()
    this.#fails = 0
    this.#set(jump(this.#state(), index))
    this.#start()
  }

  // "Play next" from a menu. An empty queue takes the songs, the first one
  // loaded paused; `from` names them then.
  playNext(ids: string[], from = '', link?: QueueLink): void {
    const s = insertNext(this.#state(), ids, from, link)
    this.#add(s, this.index + 1, queueNotice('next', ids, this.#title(ids)))
  }

  // "Add to queue" from a menu.
  append(ids: string[], from = '', link?: QueueLink): void {
    const s = append(this.#state(), ids, from, link)
    this.#add(s, this.items.length, queueNotice('add', ids, this.#title(ids)))
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

  #title(ids: string[]): string {
    return ids.length && library.has(ids[0]) ? library.track(ids[0]).title : ''
  }

  // "Play next" on a queue row: it moves up to right after the current song.
  playRowNext(i: number): void {
    if (i === this.index || i < 0 || i >= this.items.length) return
    const id = this.items[i]
    if (i === this.index + 1) {
      // already next: it only has to count as a Play next song, for shuffle
      this.#next ||= 1
      this.savePos()
    } else this.move(i, i < this.index ? this.index : this.index + 1)
    notice.show(queueNotice('next', [id], this.#title([id])))
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
      const before = this.current
      this.#set(step.state)
      if (player.playing && follows(before, this.current)) this.#carryOn()
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
      this.#set(r.state)
      this.#start()
    }
  }

  isCurrent(id: string): boolean {
    return this.current?.id === id
  }

  // A song that won't play (ALAC, WMA, a file that is gone...): log it, say so,
  // and go on to the next one. When paused (a restored queue), stay on it.
  #failed(e: EngineError): void {
    const t = this.current
    if (!t) return
    window.playbackApi.log(
      `Could not play track ${t.id} "${t.title}" (${t.codec || 'unknown codec'}): ` +
        `error ${e.code} ${e.message}${e.gone ? ' (file gone or unreadable)' : ''}` +
        (e.first ? `; before ?decode: ${e.first}` : '')
    )
    if (!player.playing) {
      notice.show(failNotice(t.title, e.gone, 'paused'))
      return
    }
    this.#fails++
    if (afterFailure(this.#fails, this.items.length) === 'stop') {
      notice.show(`Could not play ${this.#fails} songs in a row. Stopped.`)
      this.#fails = 0
      return this.#stop()
    }
    const moved = this.#move(true)
    notice.show(failNotice(t.title, e.gone, moved ? 'skipped' : 'end'))
  }

  // After the library changed: songs that are gone leave the queue.
  prune(): void {
    // the id, not this.current: after the load that already points at the new data
    const before = this.items[this.index]
    this.#set(prune(this.#state(), (id) => library.has(id)))
    if (this.items[this.index] !== before) this.#start(player.playing)
  }

  // Songs whose ids changed (see id-moves.ts). They are the same songs, so
  // nothing restarts. Called just before the library with the new ids loads.
  moveIds(moves: IdMoves): void {
    const items = moveIds(this.items, moves)
    if (items !== this.items) this.#set({ ...this.#state(), items })
  }

  // "Back to queue": the song loaded paused at its place.
  resume(): void {
    this.#start(false, player.pos)
  }

  // The queue from the last run, loaded paused where it was.
  restore(saved: SavedQueue): void {
    const s = prune(saved, (id) => library.has(id))
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
