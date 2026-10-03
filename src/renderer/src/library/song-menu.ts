// The menu for songs: the queue first, then Go to, the folder, then the playlists. Each
// part is a function; a new part is one more argument to `sections`. Songs
// come as item keys.
import type { ItemKey } from '../../../shared/plugins/items'
import type { QueueLink } from '../../../shared/saved-queue'
import { folderPath } from './folders'
import { canOpen, infoOf, openPage } from '../plugins'
import { layout } from '../stores/layout.svelte'
import { menu, type MenuEntry, type MenuItem } from '../stores/menu.svelte'
import { notice } from '../stores/notice.svelte'
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
  // what "From" opens then
  link?: QueueLink
  // the folder the songs are in, as folderParts gives it: "Show in file manager"
  folder?: string[]
}

// The parts in order, with a line between, leaving out empty ones.
export function sections(...parts: MenuEntry[][]): MenuEntry[] {
  return parts.filter((p) => p.length).flatMap((p, i) => (i ? ['line' as const, ...p] : p))
}

function queuePart(keys: ItemKey[], o: SongMenuOptions): MenuEntry[] {
  const row = o.queueRow
  if (row === undefined) {
    return [
      { label: 'Play next', run: () => queue.playNext(keys, o.from, o.link) },
      { label: 'Add to queue', run: () => queue.append(keys, o.from, o.link) }
    ]
  }
  // the queue may have changed while the menu was open
  const same = (): boolean => row < queue.items.length && queue.items[row] === keys[0]
  const entries: MenuEntry[] = [
    { label: 'Remove from queue', run: () => same() && queue.remove(row) }
  ]
  if (row !== queue.index) {
    entries.push({ label: 'Play next', run: () => same() && queue.playRowNext(row) })
  }
  return entries
}

// The pages the song's plugin links it to. One song only: several can come
// from many albums. Focus has no library to go to.
function goToPart(keys: ItemKey[]): MenuEntry[] {
  const links = keys.length === 1 && layout.hasLibrary ? infoOf(keys[0])?.links : undefined
  if (!links) return []
  return links
    .filter((l) => canOpen(l.to))
    .map((l): MenuItem => ({
      label: l.label,
      run: () => {
        // the queue's drawer would cover the page opened
        layout.showQueue = false
        openPage(l.to)
      }
    }))
}

function folderPart(o: SongMenuOptions): MenuEntry[] {
  const parts = o.folder
  if (!parts) return []
  const run = async (): Promise<void> => {
    if (!(await window.libraryApi.showFolder(parts)))
      notice.show(`Couldn't open ${folderPath(parts)}`)
  }
  return [{ label: 'Show in file manager', run: () => void run() }]
}

function playlistPart(keys: ItemKey[], o: SongMenuOptions): MenuEntry[] {
  const entries: MenuEntry[] = [{ heading: 'Add to playlist' }]
  for (const p of playlists.list) {
    if (p.id === o.inPlaylist || p.id === o.onPlaylist) continue
    entries.push({ label: p.name, indent: true, run: () => playlists.add(p.id, keys) })
  }
  entries.push({ label: 'New playlist', indent: true, run: () => playlists.create(keys) })
  const inPlaylist = o.inPlaylist
  if (inPlaylist) {
    entries.push('line', {
      label: 'Remove from this playlist',
      run: () => playlists.removeItems(inPlaylist, keys)
    })
  }
  return entries
}

export function songMenu(keys: ItemKey[], o: SongMenuOptions = {}): MenuEntry[] {
  return sections(queuePart(keys, o), goToPart(keys), folderPart(o), playlistPart(keys, o))
}

// Only the playlists, for the "Add to playlist" buttons on page headers.
export function playlistMenu(keys: ItemKey[], o: SongMenuOptions = {}): MenuEntry[] {
  return playlistPart(keys, o)
}

export function openPlaylistMenu(e: MouseEvent, keys: ItemKey[], o: SongMenuOptions = {}): void {
  menu.showFor(e, playlistMenu(keys, o))
}

export function openSongMenu(e: MouseEvent, keys: ItemKey[], o: SongMenuOptions = {}): void {
  menu.showFor(e, songMenu(keys, o))
}
