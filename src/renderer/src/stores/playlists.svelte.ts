// The user's playlists. Every change goes to main, which checks and saves the list.
import * as ops from '../../../shared/playlists'
import type { Playlist } from '../../../shared/playlists'
import { library } from './library.svelte'
import { notice } from './notice.svelte'

class PlaylistStore {
  list: Playlist[] = $state.raw([])
  // the playlist whose name is being edited; set right after "New playlist"
  editing: string | null = $state(null)

  // false when main could not give the playlists: an edit then must not
  // replace the user's file with this run's list
  #canSave = true

  load(list: Playlist[], ok = true): void {
    this.list = list
    this.#canSave = ok
  }

  #set(list: Playlist[]): void {
    this.list = list
    if (this.#canSave) window.playlistsApi.save(list)
  }

  get(id: string): Playlist | undefined {
    return this.list.find((p) => p.id === id)
  }

  // Makes a playlist and returns its id.
  create(trackIds: string[] = []): string {
    const id = crypto.randomUUID()
    const name = ops.newName(this.list)
    this.#set(ops.create(this.list, id, name, trackIds))
    if (trackIds.length) notice.show(`Added ${songs(trackIds.length)} to ${name}`)
    return id
  }

  rename(id: string, name: string): void {
    this.#set(ops.rename(this.list, id, name))
  }

  remove(id: string): void {
    const p = this.get(id)
    this.#set(ops.remove(this.list, id))
    if (library.section === `pl:${id}`) library.section = 'songs'
    if (library.openPlaylist === id) library.openPlaylist = null
    if (p) notice.show(`Deleted ${p.name}`)
  }

  add(id: string, trackIds: string[]): void {
    const p = this.get(id)
    if (!p) return
    const r = ops.addTracks(this.list, id, trackIds)
    if (r.added) this.#set(r.list)
    notice.show(r.added ? `Added ${songs(r.added)} to ${p.name}` : `Already in ${p.name}`)
  }

  removeTracks(id: string, trackIds: string[]): void {
    this.#set(ops.removeTracks(this.list, id, trackIds))
  }
}

function songs(n: number): string {
  return n === 1 ? '1 song' : `${n} songs`
}

export const playlists = new PlaylistStore()
