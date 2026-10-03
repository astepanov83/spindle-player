// The user's playlists. Every change goes to main, which checks and saves the list.
import * as ops from '../../../shared/playlists'
import type { Playlist } from '../../../shared/playlists'
import { movePlaylists, type IdMoves } from '../../../shared/id-moves'
import { keysOfTracks, trackIdOf } from './item-tracks'
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

  // Makes a playlist and returns its id. One made from songs is named after
  // them (ops.nameForSongs); an empty one is "New playlist", typed over next.
  // Songs come as track ids here and below; the list keeps item keys.
  create(trackIds: string[] = []): string {
    const id = crypto.randomUUID()
    const known = trackIds.filter((t) => library.has(t)).map((t) => library.track(t))
    const name = ops.newName(this.list, known.length ? ops.nameForSongs(known) : undefined)
    this.#set(ops.create(this.list, id, name, keysOfTracks(trackIds)))
    if (trackIds.length) notice.show(`Added ${songs(trackIds.length)} to ${name}`)
    return id
  }

  rename(id: string, name: string): void {
    this.#set(ops.rename(this.list, id, name))
  }

  remove(id: string): void {
    const p = this.get(id)
    this.#set(ops.remove(this.list, id))
    library.forgetPlaylist(id)
    if (p) notice.show(`Deleted ${p.name}`)
  }

  add(id: string, trackIds: string[]): void {
    const p = this.get(id)
    if (!p) return
    const r = ops.addItems(this.list, id, keysOfTracks(trackIds))
    if (r.added) this.#set(r.list)
    notice.show(r.added ? `Added ${songs(r.added)} to ${p.name}` : `Already in ${p.name}`)
  }

  // Songs whose ids changed (see id-moves.ts); main renames its copy too.
  moveIds(moves: IdMoves): void {
    const list = movePlaylists(this.list, moves)
    if (list !== this.list) this.#set(list)
  }

  // the playlist's own keys of these songs, whatever plugin they are of
  removeTracks(id: string, trackIds: string[]): void {
    const drop = new Set(trackIds)
    const keys = this.get(id)?.items.filter((k) => drop.has(trackIdOf(k))) ?? []
    this.#set(ops.removeItems(this.list, id, keys))
  }
}

function songs(n: number): string {
  return n === 1 ? '1 song' : `${n} songs`
}

export const playlists = new PlaylistStore()
