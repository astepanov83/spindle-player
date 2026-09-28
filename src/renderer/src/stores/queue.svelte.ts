// The list you played from, and the song playing from it. See work/specs/queue.md.
// The moves are plain functions in queue/logic.ts; this store plays what they pick.
import { moveIds, type IdMoves } from '../../../shared/id-moves'
import type { Album, Track } from '../../../shared/library'
import type { SavedQueue } from '../../../shared/saved-queue'
import { engine, mediaUrl, type EngineError } from '../audio/engine'
import {
  advance,
  afterFailure,
  back,
  follows,
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
      // follow the element, so a pause from media keys or the system shows too
      playing: () => {
        this.#fails = 0
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
    })
  }

  // The list can hold 50k ids, so it goes to main only when it changes. A new
  // current song alone goes from #start, which always follows, with its position.
  #set(s: QueueState): void {
    const listChanged = s.items !== this.items || s.from !== this.from
    this.items = s.items
    this.index = s.index
    this.from = s.from
    if (listChanged) this.#saveList()
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
    engine.load(mediaUrl(t.part?.file ?? t.id), at, t.part)
    if (andPlay) play()
    else player.playing = false
  }

  // The new current song is the next part of the file playing (the next
  // track of a disc image): the sound goes on, with no reload and no gap.
  #carryOn(): void {
    const t = this.current!
    player.pos = 0
    player.duration = t.duration
    engine.continueWith(t.part!)
    this.savePos()
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

  // skipping: while skipping songs that fail, don't add an album that is already
  // in the queue again (the library wraps around), so the queue can't keep growing
  #nextOptions(skipping = false): NextOptions {
    return {
      shuffle: player.shuffle,
      nextAlbum: (id) => (library.has(id) ? library.nextAlbumTracks(id) : []),
      noRepeats: skipping
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
      const before = this.current
      this.#set(step.state)
      if (player.playing && follows(before, this.current)) this.#carryOn()
      else this.#start()
    } else this.#stop()
  }

  #move(andPlay: boolean, skipping = false): boolean {
    const before = this.#state()
    const after = advance(before, this.#nextOptions(skipping))
    // nowhere to go (nothing in the library after the list): stop at the end
    if (after === before) {
      this.#stop()
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

  prev(): void {
    if (!this.items.length) return
    const r = back(this.#state(), player.pos)
    if (r.restart) {
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
        `error ${e.code} ${e.message}`
    )
    // A format Chromium can't read and a file that is gone give the same error (4).
    if (!player.playing) {
      notice.show(`Can't play "${t.title}".`)
      return
    }
    this.#fails++
    if (afterFailure(this.#fails, this.items.length) === 'stop') {
      notice.show(`Could not play ${this.#fails} songs in a row. Stopped.`)
      this.#fails = 0
      return this.#stop()
    }
    if (this.#move(true, true)) notice.show(`Can't play "${t.title}". Skipped.`)
    else notice.show(`Can't play "${t.title}". Stopped at the end of the list.`)
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

  // The current song and position, without the list.
  savePos(): void {
    this.#savedPos = player.pos
    window.playbackApi.savePlace({ index: this.index, pos: player.pos })
  }
}

export const queue = new QueueStore()
