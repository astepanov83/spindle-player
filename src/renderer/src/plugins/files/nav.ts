// The files plugin's tabs and their open pages. The library's own views
// read and change their page here until blocks draw them (ticket 059).
import { crumbs, folderSearchText, shownFolder } from '../../library/folders'
import { library } from '../../stores/library.svelte'
import type { PageAddress, Tab } from '../types'
import { albumPage, artistPage, filesTabOf, folderPage, parsePage } from './pages'

// the music folders' albums, not MFP's episodes
function localAlbum(id: string): boolean {
  const al = library.findAlbum(id)
  return !!al && !al.online
}

export function filesTabs(): Tab[] {
  return [
    { id: 'songs', label: 'Songs', icon: 'note', search: 'Search songs', only: 'sidebar' },
    {
      id: 'albums',
      label: 'Albums',
      icon: 'disc',
      search: 'Search your library',
      searchShort: 'Search library'
    },
    { id: 'artists', label: 'Artists', icon: 'person', search: 'Search artists' },
    {
      id: 'folders',
      label: 'Folders',
      icon: 'folder',
      search: folderSearchText(library.folders, shownFolderKey())
    }
  ]
}

export function canOpenFiles(to: PageAddress): boolean {
  const p = parsePage(to.page)
  if (p?.kind === 'album') return localAlbum(p.id)
  if (p?.kind === 'artist') return !p.album && !!library.getArtist(p.key)
  if (p?.kind === 'folder') return library.folders.byKey.has(p.key)
  return false
}

// An album or artist that is gone closes; an album under an artist shows the
// artist. A folder that is gone stays: the view shows the nearest one above
// (shownFolder).
export function keepFiles(_tab: string, page: string): string {
  const p = parsePage(page)
  if (!p) return ''
  if (p.kind === 'album') return localAlbum(p.id) ? page : ''
  if (p.kind !== 'artist') return page
  if (!library.getArtist(p.key)) return ''
  return p.album && !localAlbum(p.album) ? artistPage(p.key) : page
}

export function filesPath(tab: string, page: string): string[] {
  const p = parsePage(page)
  const path: string[] = []
  if (p?.kind === 'album') path.push(`album:${p.id}`)
  if (p?.kind === 'artist') {
    path.push(`artist:${p.key}`)
    if (p.album) path.push(`album:${p.album}`)
  }
  if (tab === 'folders') {
    const tree = library.folders
    const i = shownFolder(tree, p?.kind === 'folder' ? p.key : null)
    if (i !== null) for (const j of crumbs(tree, i)) path.push(`folder:${tree.nodes[j].key}`)
  }
  // The search results (Albums) and the filtered grid (Artists) show over
  // the open view, so they are a view below it (ticket 039). Other views
  // filter in place and stay the same view.
  if (library.query.trim() && (tab === 'albums' || tab === 'artists')) {
    path.push('search')
    if (tab === 'albums' && library.searchAll) path.push(`all:${library.searchAll}`)
  }
  return path
}

// Albums: the open album, null for the grid
export function shownAlbum(): string | null {
  const p = parsePage(library.page('albums'))
  return p?.kind === 'album' ? p.id : null
}

// from the grid or the search results; null is the back link
export function openAlbum(id: string | null): void {
  library.openPage('albums', id ? albumPage(id) : '')
}

// Artists: the open artist (null for the grid), and an album opened from it
export function shownArtist(): { key: string | null; album: string | null } {
  const p = parsePage(library.page('artists'))
  return p?.kind === 'artist' ? { key: p.key, album: p.album ?? null } : { key: null, album: null }
}

// null goes back to the grid
export function openArtist(key: string | null): void {
  library.follow(null)
  library.openPage('artists', key ? artistPage(key) : '')
}

// null goes back to the artist
export function openArtistAlbum(id: string | null): void {
  const { key } = shownArtist()
  if (key) library.openPage('artists', artistPage(key, id))
}

// The open artist is renamed or split: show `key` once it is in the library,
// with the album opened from it, if any.
export function followArtist(key: string): void {
  library.follow({
    tab: 'artists',
    to: (page) => {
      const p = parsePage(page)
      return p?.kind === 'artist' ? artistPage(key, p.album) : ''
    }
  })
}

// Folders: the open folder by key (see folders.ts), null for the top
export function shownFolderKey(): string | null {
  const p = parsePage(library.page('folders'))
  return p?.kind === 'folder' ? p.key : null
}

// The path bar and subfolders. The search text stays, so a match deeper down
// can be followed to.
export function openFolder(key: string | null): void {
  library.openPage('folders', key ? folderPage(key) : '', true)
}

// A link to a page of the plugin (the album page's artist and folder, an
// artist in the search results). Something a rescan removed opens nothing.
function showLink(page: string): void {
  const tab = filesTabOf(page)
  if (tab && canOpenFiles({ plugin: 'files', page })) library.link(tab, page)
}

export const showArtist = (key: string): void => showLink(artistPage(key))
export const showFolder = (key: string): void => showLink(folderPage(key))
