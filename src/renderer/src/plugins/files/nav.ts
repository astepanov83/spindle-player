// The files plugin's tabs and their open pages, with the helpers its actions
// open pages with.
import { crumbs, folderSearchText, shownFolder } from './folders'
import { library } from '../../stores/library.svelte'
import { files } from './store.svelte'
import type { PageAddress, Tab } from '../types'
import { artistPage, filesTabOf, fixesPage, folderPage, genrePage, parsePage } from './pages'
import { viewLook } from '../../stores/settings.svelte'

const isAlbum = (id: string): boolean => !!files.findAlbum(id)

export function filesTabs(): Tab[] {
  return [
    {
      id: 'songs',
      label: 'Songs',
      icon: 'note',
      search: 'Search songs',
      only: 'sidebar',
      fields: true
    },
    {
      id: 'albums',
      label: 'Albums',
      icon: 'disc',
      search: 'Search your library',
      searchShort: 'Search library',
      // its results page finds songs, albums and artists
      searchWide: true,
      fields: true
    },
    { id: 'artists', label: 'Artists', icon: 'person', search: 'Search artists', fields: true },
    { id: 'genres', label: 'Genres', icon: 'genre', search: 'Search genres', fields: true },
    {
      id: 'folders',
      label: 'Folders',
      icon: 'folder',
      search: folderSearchText(files.folders, openFolderKey()),
      fields: true
    }
  ]
}

// the open folder's key, null for the top
function openFolderKey(): string | null {
  const p = parsePage(library.page('folders'))
  return p?.kind === 'folder' ? p.key : null
}

export function canOpenFiles(to: PageAddress): boolean {
  const p = parsePage(to.page)
  if (p?.kind === 'album') return isAlbum(p.id)
  if (p?.kind === 'artist') return !p.album && !!files.getArtist(p.key)
  if (p?.kind === 'genre') return !p.album && !!files.getGenre(p.key)
  if (p?.kind === 'folder') return files.folders.byKey.has(p.key)
  return p?.kind === 'fixes'
}

// An album, artist or genre that is gone closes; an album under an artist
// or genre shows that. A folder that is gone stays: the view shows the
// nearest one above (shownFolder).
export function keepFiles(_tab: string, page: string): string {
  const p = parsePage(page)
  if (!p) return ''
  if (p.kind === 'album') return isAlbum(p.id) ? page : ''
  if (p.kind === 'genre') {
    if (!files.getGenre(p.key)) return ''
    return p.album && !isAlbum(p.album) ? genrePage(p.key) : page
  }
  if (p.kind !== 'artist') return page
  if (!files.getArtist(p.key)) return ''
  return p.album && !isAlbum(p.album) ? artistPage(p.key) : page
}

export function filesPath(tab: string, page: string): string[] {
  const p = parsePage(page)
  const path: string[] = []
  if (p?.kind === 'album') path.push(`album:${p.id}`)
  if (p?.kind === 'fixes') path.push('fixes')
  if (p?.kind === 'artist') {
    path.push(`artist:${p.key}`)
    if (p.album) path.push(`album:${p.album}`)
  }
  if (p?.kind === 'genre') {
    path.push(`genre:${p.key}`)
    if (p.album) path.push(`album:${p.album}`)
  }
  if (tab === 'folders') {
    const tree = files.folders
    const i = shownFolder(tree, p?.kind === 'folder' ? p.key : null)
    if (i !== null) for (const j of crumbs(tree, i)) path.push(`folder:${tree.nodes[j].key}`)
  }
  // The search results (Albums) and the filtered grids (Artists, Genres)
  // show over the open view, so they are a view below it (ticket 039).
  // Other views filter in place and stay the same view.
  if (library.query.trim() && (tab === 'albums' || tab === 'artists' || tab === 'genres'))
    path.push('search')
  return path
}

// How the open view is drawn (ticket 095), as page.ts draws it: none for an
// album's page, the name fixes or the search results, which have one look.
export function filesLook(tab: string, page: string): string | undefined {
  const p = parsePage(page)
  const searching = !!library.query.trim()
  if (tab === 'albums')
    return searching || (p?.kind === 'album' && isAlbum(p.id)) ? undefined : viewLook('albums')
  if (tab === 'genres') return genresLook(p, searching)
  if (tab !== 'artists') return undefined
  if (searching) return viewLook('artists')
  if (p?.kind === 'artist' && p.album && isAlbum(p.album)) return undefined
  if (p?.kind === 'artist' && files.getArtist(p.key)) return viewLook('artistPage')
  return p?.kind === 'fixes' ? undefined : viewLook('artists')
}

// A genre's page shows its albums in the Albums look; an album opened from
// it has one look.
function genresLook(p: ReturnType<typeof parsePage>, searching: boolean): string | undefined {
  if (searching || p?.kind !== 'genre' || !files.getGenre(p.key)) return viewLook('genres')
  return p.album && isAlbum(p.album) ? undefined : viewLook('albums')
}

// null goes back to the grid
export function openArtist(key: string | null): void {
  library.follow(null)
  library.openPage('artists', key ? artistPage(key) : '')
}

// The open artist is renamed or split: show `key` once it is in the library,
// with the album opened from it, if any.
export function followArtist(key: string): void {
  const open = parsePage(library.page('artists'))
  const was = open?.kind === 'artist' ? open.key : null
  library.follow({
    tab: 'artists',
    to: (page) => {
      const p = parsePage(page)
      return p?.kind === 'artist' ? artistPage(key, p.album) : ''
    },
    // their page and their albums' still follow; another artist or the grid not
    keeps: (page) => {
      const p = parsePage(page)
      return p?.kind === 'artist' && p.key === was
    }
  })
}

// A link to a page of the plugin (an artist's Edit from the search results).
// Something a rescan removed opens nothing.
function showLink(page: string): void {
  const tab = filesTabOf(page)
  if (tab && canOpenFiles({ plugin: 'files', page })) library.link(tab, page)
}

export const showArtist = (key: string): void => showLink(artistPage(key))
export const goToFolder = (key: string): void => showLink(folderPage(key))
export const showFixes = (): void => showLink(fixesPage)
export const showGenre = (key: string): void => showLink(genrePage(key))
