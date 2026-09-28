// The list you played from, and the song playing from it. See work/specs/queue.md.
// The moves are plain functions in queue/logic.ts; this store plays what they pick.
import type { Album, Track } from '../../../shared/library'
import type { SavedQueue } from '../../../shared/saved-queue'
import { engine, mediaUrl, type EngineError } from '../audio/engine'
import {
  advance,
  afterFailure,
  back,
  jump,
  onEnded,
  prune,
  type NextOptions,
  type QueueState
} from '../queue/logic'
import { library } from './library.svelte'
import { notice } from './notice.svelte'
import { play, player } from './player.svelte'

// The position goes to main this often while playing (plus on pause, seek and quit).
const savePosEverySec = 5

class QueueStore {
  items: string[] = $state.raw([])
  index = $state(0)
  from = $state('')

  // nothing until a song is picked
  current: Track | undefined = $derived(
    this.items.length ? library.track(this.items[this.index]) : undefined
  )
  currentAlbum: Album | undefined = $derived(
    this.current ? library.album(this.current.albumId) : undefined
  )

  #fails = 0
  #savedPos = 0

  constructor() {
    engine.on({
      time: (t) => {
        player.pos = t
        if (Math.abs(t - this.#savedPos) >= savePosEverySec) this.savePos()
      },
      duration: (d) => (player.duration = d),
      ended: () => this.#ended(),
      playing: () => (this.#fails = 0),
      paused: () => this.savePos(),
      seeked: () => this.savePos(),
      error: (e) => this.#failed(e)
    })
  }

  #set(s: QueueState): void {
    const changed = s.items !== this.items || s.index !== this.index || s.from !== this.from
    this.items = s.items
    this.index = s.index
    this.from = s.from
    if (changed) this.#saveList()
  }

  // Loads the current song at `at` seconds, and plays it if `andPlay`.
  #start(andPlay = true, at = 0): void {
    const t = this.current
    player.pos = at
    this.savePos()
    if (!t) {
      player.playing = false
      player.duration = 0
      engine.clear()
      return
    }
    player.duration = t.duration
    engine.load(mediaUrl(t.id), at)
    if (andPlay) play()
    else player.playing = false
  }

  // Replaces the queue with a list and plays the clicked song.
  playList(ids: string[], index: number, from: string): void {
    if (!ids.length) return
    this.#fails = 0
    this.#set({ items: ids, index: Math.min(index, ids.length - 1), from })
    this.#start()
  }

  playAlbum(albumId: string, index: number): void {
    const al = library.album(albumId)
    this.playList(al.trackIds, index, al.title)
  }

  // Clicking a row; the current one starts again.
  jump(index: number): void {
    this.#fails = 0
    this.#set(jump(this.#state(), index))
    this.#start()
  }

  #nextOptions(): NextOptions {
    return {
      shuffle: player.shuffle,
      nextAlbum: (id) => (library.has(id) ? library.nextAlbumTracks(id) : [])
    }
  }

  // The Next button.
  next(): void {
    if (!this.items.length) return
    this.#fails = 0
    this.#move(true)
  }

  #ended(): void {
    const step = onEnded(this.#state(), player.repeat, this.#nextOptions())
    if (step.kind === 'replay') {
      engine.seek(0)
      play()
    } else if (step.kind === 'play') {
      this.#set(step.state)
      this.#start()
    } else this.#stop()
  }

  #move(andPlay: boolean): void {
    const before = this.#state()
    const after = advance(before, this.#nextOptions())
    // nowhere to go (nothing in the library after the list): stop at the end
    if (after === before) return this.#stop()
    this.#set(after)
    this.#start(andPlay)
  }

  #stop(): void {
    engine.pause()
    player.playing = false
  }

  prev(): void {
    if (!this.items.length) return
    const r = back(this.#state(), player.pos)
    if (r.restart) {
      player.pos = 0
      engine.seek(0)
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
  // and go on to the next one.
  #failed(e: EngineError): void {
    const t = this.current
    if (!t) return
    window.playbackApi.log(
      `Could not play track ${t.id} "${t.title}" (${t.codec || 'unknown codec'}): ` +
        `error ${e.code} ${e.message}`
    )
    this.#fails++
    if (afterFailure(this.#fails, this.items.length) === 'stop') {
      notice.show(`Could not play ${this.#fails} songs in a row. Stopped.`)
      this.#fails = 0
      return this.#stop()
    }
    // A format Chromium can't read and a file that is gone give the same error (4).
    notice.show(`Can't play "${t.title}". Skipped.`)
    this.#move(player.playing)
  }

  // After the library changed: songs that are gone leave the queue.
  prune(): void {
    // the id, not this.current: after the load that already points at the new data
    const before = this.items[this.index]
    this.#set(prune(this.#state(), (id) => library.has(id)))
    if (this.items[this.index] !== before) this.#start(player.playing)
  }

  // The queue from the last run, loaded paused where it was.
  restore(saved: SavedQueue): void {
    const s = prune(saved, (id) => library.has(id))
    if (!s.items.length) return
    this.items = s.items
    this.index = s.index
    this.from = s.from
    // a different current song means the old one is gone: start it from the top
    const same = s.items[s.index] === saved.items[saved.index]
    this.#start(false, same ? saved.pos : 0)
  }

  #state(): QueueState {
    return { items: this.items, index: this.index, from: this.from }
  }

  // the position follows right after, from #start
  #saveList(): void {
    window.playbackApi.saveQueue({ ...this.#state(), pos: player.pos })
  }

  savePos(): void {
    this.#savedPos = player.pos
    window.playbackApi.savePos(player.pos)
  }
}

export const queue = new QueueStore()
