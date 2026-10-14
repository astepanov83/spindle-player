// The files plugin's page strings. Links use the ones of queue.json (ruling
// R1): "album/<id>", "artist/<key>", "folder/<key>". An album opened from an
// artist is "album/<id>/artist/<key>" in the Artists tab: album ids hold no
// "/", artist and folder keys may. '' is a tab's top. "name-fixes" is the
// Artists tab's list of name fixes (ticket 074), "song-changes" the Albums
// tab's list of songs whose info was changed in Spindle (ticket 129).

export type FilesPage =
  | { kind: 'top' }
  | { kind: 'album'; id: string }
  | { kind: 'artist'; key: string; album?: string }
  | { kind: 'folder'; key: string }
  | { kind: 'fixes' }
  | { kind: 'changes' }

export const fixesPage = 'name-fixes'
export const changesPage = 'song-changes'
export const albumPage = (id: string): string => `album/${id}`
export const folderPage = (key: string): string => `folder/${key}`
export const artistPage = (key: string, album?: string | null): string =>
  album ? `album/${album}/artist/${key}` : `artist/${key}`

// Undefined for a page this version doesn't know.
export function parsePage(page: string): FilesPage | undefined {
  if (!page) return { kind: 'top' }
  if (page === fixesPage) return { kind: 'fixes' }
  if (page === changesPage) return { kind: 'changes' }
  const at = page.indexOf('/')
  const kind = page.slice(0, at)
  const rest = page.slice(at + 1)
  if (at < 0 || !rest) return undefined
  if (kind === 'artist') return { kind, key: rest }
  if (kind === 'folder') return { kind, key: rest }
  if (kind !== 'album') return undefined
  const end = rest.indexOf('/')
  if (end < 0) return { kind, id: rest }
  const key = rest.slice(end + 1).match(/^artist\/(.+)$/s)?.[1]
  return key ? { kind: 'artist', key, album: rest.slice(0, end) } : undefined
}

// The tab a link opens in: Albums (an album, the song changes), Artists (an
// artist, the name fixes) or Folders.
export function filesTabOf(page: string): string | undefined {
  const p = parsePage(page)
  if (p?.kind === 'album' || p?.kind === 'changes') return 'albums'
  if ((p?.kind === 'artist' && !p.album) || p?.kind === 'fixes') return 'artists'
  if (p?.kind === 'folder') return 'folders'
  return undefined
}
