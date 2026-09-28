// The menu for songs: add them to a playlist, or take them out of this one.
import { menu, type MenuEntry } from '../stores/menu.svelte'
import { playlists } from '../stores/playlists.svelte'

export function songMenu(trackIds: string[], inPlaylist?: string): MenuEntry[] {
  const entries: MenuEntry[] = [{ heading: 'Add to playlist' }]
  for (const p of playlists.list) {
    if (p.id === inPlaylist) continue
    entries.push({ label: p.name, indent: true, run: () => playlists.add(p.id, trackIds) })
  }
  entries.push({ label: 'New playlist', indent: true, run: () => playlists.create(trackIds) })
  if (inPlaylist) {
    entries.push('line', {
      label: 'Remove from this playlist',
      run: () => playlists.removeTracks(inPlaylist, trackIds)
    })
  }
  return entries
}

export function openSongMenu(e: MouseEvent, trackIds: string[], inPlaylist?: string): void {
  menu.showFor(e, songMenu(trackIds, inPlaylist))
}
