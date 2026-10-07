// The user's playlists. Every change goes to main, which checks and saves the list.
import * as ops from '../../../shared/playlists'
import type { Playlist } from '../../../shared/playlists'
import { moveKeys, movePlaylists, type IdMoves } from '../../../shared/id-moves'
import type { PluginId } from '../../../shared/plugins'
import type { ItemKey } from '../../../shared/plugins/items'
import { infoOf } from '../plugins'
import type { ItemInfo } from '../plugins/types'
import { library } from './library.svelte'
import { removedNotice } from '../queue/logic'
import { notice, type NoticeAction } from './notice.svelte'

class PlaylistStore {
  list: Playlist[] = $state.raw([])
  // the playlist whose name is being edited; set right after "New playlist"
  editing: string | null = $state(null)

  // the last "Remove from this playlist", while its notice offers Undo
  #undo: { id: string; removed: ops.Removed[]; action: NoticeAction } | undefined

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
  // Songs come as item keys here and below.
  create(keys: ItemKey[] = []): string {
    const id = crypto.randomUUID()
    const known = keys.flatMap((k) => {
      const i = infoOf(k)
      return i ? [nameParts(i)] : []
    })
    const name = ops.newName(this.list, known.length ? ops.nameForSongs(known) : undefined)
    this.#set(ops.create(this.list, id, name, keys))
    if (keys.length) notice.show(`Added ${songs(keys.length)} to ${name}`)
    return id
  }

  rename(id: string, name: string): void {
    this.#set(ops.rename(this.list, id, name))
  }

  remove(id: string): void {
    const p = this.get(id)
    this.#set(ops.remove(this.list, id))
    // the views and their history leave it
    library.forgetPlaylist(id)
    if (p) notice.show(`Deleted ${p.name}`)
  }

  add(id: string, keys: ItemKey[]): void {
    const p = this.get(id)
    if (!p) return
    const r = ops.addItems(this.list, id, keys)
    if (r.added) this.#set(r.list)
    notice.show(r.added ? `Added ${songs(r.added)} to ${p.name}` : `Already in ${p.name}`)
  }

  // Songs whose ids changed (see id-moves.ts); main renames its copy too.
  moveIds(plugin: PluginId, moves: IdMoves): void {
    const list = movePlaylists(this.list, plugin, moves)
    if (list !== this.list) this.#set(list)
    // an Undo on offer puts back the same songs, by their new ids
    const u = this.#undo
    if (u) {
      const keys = moveKeys(
        u.removed.map((r) => r.key),
        plugin,
        moves
      )
      u.removed = u.removed.map((r, i) => ({ ...r, key: keys[i] }))
    }
  }

  // "Remove from this playlist" and Delete on its row. Its notice offers
  // Undo, which puts the songs back at their places.
  removeItems(id: string, keys: ItemKey[]): void {
    const p = this.get(id)
    const removed = ops.removedAt(this.list, id, keys)
    if (!p || !removed.length) return
    this.#set(ops.removeItems(this.list, id, keys))
    const action: NoticeAction = { label: 'Undo', run: () => this.#undoRemove() }
    this.#undo = { id, removed, action }
    const text =
      removed.length === 1
        ? removedNotice(infoOf(removed[0].key)?.title ?? '', p.name)
        : `Removed ${songs(removed.length)} from ${p.name}`
    notice.show(text, action)
  }

  #undoRemove(): void {
    const u = this.#undo
    this.#undo = undefined
    if (!u) return
    const list = ops.putBack(this.list, u.id, u.removed)
    if (list !== this.list) this.#set(list)
  }
}

// A song's album (its group, told apart by the page it opens) and artist.
function nameParts(i: ItemInfo): { albumId: string; album: string; artist: string } {
  const to = i.groupTo
  const album = i.group ?? ''
  return { albumId: to ? `${to.plugin}:${to.page}` : album, album, artist: i.subtitle ?? '' }
}

function songs(n: number): string {
  return n === 1 ? '1 song' : `${n} songs`
}

export const playlists = new PlaylistStore()
