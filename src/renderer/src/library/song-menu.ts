// The menu for songs: the queue first, then the playlists. Each part is a
// function; a new part is one more argument to `sections`.
import { menu, type MenuEntry } from '../stores/menu.svelte'
import { playlists } from '../stores/playlists.svelte'
import { queue } from '../stores/queue.svelte'

export interface SongMenuOptions {
  // the songs are rows of this playlist: they can leave it
  inPlaylist?: string
  // the menu of this playlist's page: it is not offered to add to
  onPlaylist?: string
  // the song is this row of the queue
  queueRow?: number
  // names the songs when they start an empty queue ("From ...")
  from?: string
}

// The parts in order, with a line between, leaving out empty ones.
export function sections(...parts: MenuEntry[][]): MenuEntry[] {
  return parts.filter((p) => p.length).flatMap((p, i) => (i ? ['line' as const, ...p] : p))
}

function queuePart(ids: string[], o: SongMenuOptions): MenuEntry[] {
  const row = o.queueRow
  if (row === undefined) {
    return [
      { label: 'Play next', run: () => queue.playNext(ids, o.from) },
      { label: 'Add to queue', run: () => queue.append(ids, o.from) }
    ]
  }
  // the queue may have changed while the menu was open
  const same = (): boolean => queue.items[row] === ids[0]
  const entries: MenuEntry[] = [
    { label: 'Remove from queue', run: () => same() && queue.remove(row) }
  ]
  if (row !== queue.index) {
    entries.push({ label: 'Play next', run: () => same() && queue.playRowNext(row) })
  }
  return entries
}

function playlistPart(ids: string[], o: SongMenuOptions): MenuEntry[] {
  const entries: MenuEntry[] = [{ heading: 'Add to playlist' }]
  for (const p of playlists.list) {
    if (p.id === o.inPlaylist || p.id === o.onPlaylist) continue
    entries.push({ label: p.name, indent: true, run: () => playlists.add(p.id, ids) })
  }
  entries.push({ label: 'New playlist', indent: true, run: () => playlists.create(ids) })
  const inPlaylist = o.inPlaylist
  if (inPlaylist) {
    entries.push('line', {
      label: 'Remove from this playlist',
      run: () => playlists.removeTracks(inPlaylist, ids)
    })
  }
  return entries
}

export function songMenu(trackIds: string[], o: SongMenuOptions = {}): MenuEntry[] {
  return sections(queuePart(trackIds, o), playlistPart(trackIds, o))
}

// Only the playlists, for the "Add to playlist" buttons on page headers.
export function playlistMenu(trackIds: string[], o: SongMenuOptions = {}): MenuEntry[] {
  return playlistPart(trackIds, o)
}

export function openPlaylistMenu(e: MouseEvent, trackIds: string[], o: SongMenuOptions = {}): void {
  menu.showFor(e, playlistMenu(trackIds, o))
}

export function openSongMenu(e: MouseEvent, trackIds: string[], o: SongMenuOptions = {}): void {
  menu.showFor(e, songMenu(trackIds, o))
}
