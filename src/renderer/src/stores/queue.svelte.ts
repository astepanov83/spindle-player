// The list you played from. Ticket 007 adds real playback.
import type { Album, Track } from '../../../shared/library'
import { advance, back, type QueueState } from '../queue/logic'
import { library } from './library.svelte'
import { player } from './player.svelte'

class QueueStore {
  items: string[] = $state.raw([])
  index = $state(0)
  from = $state('')

  current: Track = $derived(library.track(this.items[this.index]))
  currentAlbum: Album = $derived(library.album(this.current.albumId))

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
    const r = back(this.#state(), player.pos)
    if (r.restart) player.pos = 0
    else {
      this.#set(r.state)
      this.#start()
    }
  }

  isCurrent(id: string): boolean {
    return this.current.id === id
  }

  #state(): QueueState {
    return { items: this.items, index: this.index, from: this.from }
  }
}

export const queue = new QueueStore()
{
  // the prototype starts on Paper Suns, second song, paused
  const al = library.albums[2]
  queue.items = al.trackIds
  queue.index = 1
  queue.from = al.title
}
