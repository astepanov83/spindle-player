// The list you played from. Ticket 007 adds real playback.
import type { Album, Track } from '../../../shared/library'
import { advance, back, prune, type QueueState } from '../queue/logic'
import { library } from './library.svelte'
import { player } from './player.svelte'

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

  #set(s: QueueState): void {
    this.items = s.items
    this.index = s.index
    this.from = s.from
  }

  #start(): void {
    player.pos = 0
    player.playing = true
  }

  // Replaces the queue with a list and plays the clicked song.
  playList(ids: string[], index: number, from: string): void {
    this.#set({ items: ids, index, from })
    this.#start()
  }

  playAlbum(albumId: string, index: number): void {
    const al = library.album(albumId)
    this.playList(al.trackIds, index, al.title)
  }

  jump(index: number): void {
    this.index = index
    this.#start()
  }

  // auto: the song ended by itself
  next(auto = false): void {
    if (!this.items.length) return
    if (auto && player.repeat) {
      player.pos = 0
      return
    }
    this.#set(
      advance(this.#state(), {
        shuffle: player.shuffle,
        nextAlbum: (id) => library.nextAlbumTracks(id)
      })
    )
    this.#start()
  }

  prev(): void {
    if (!this.items.length) return
    const r = back(this.#state(), player.pos)
    if (r.restart) player.pos = 0
    else {
      this.#set(r.state)
      this.#start()
    }
  }

  isCurrent(id: string): boolean {
    return this.current?.id === id
  }

  // After the library changed: songs that are gone leave the queue.
  prune(): void {
    // the id, not this.current: after the load that already points at the new data
    const before = this.items[this.index]
    this.#set(prune(this.#state(), (id) => library.has(id)))
    if (this.items[this.index] !== before) {
      player.pos = 0
      if (!this.current) player.playing = false
    }
  }

  #state(): QueueState {
    return { items: this.items, index: this.index, from: this.from }
  }
}

export const queue = new QueueStore()
