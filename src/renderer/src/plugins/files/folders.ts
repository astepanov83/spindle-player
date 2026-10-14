// The Folders view (ticket 020): the folder tree from main's folder table,
// search, and what Play plays. No DOM.
import type { Folder, Track } from '../../../../shared/library'
import {
  hasQuery,
  hasText,
  parseQuery,
  songTest,
  type Query,
  type SongFields
} from '../../library/search-query'
import { foldedName, songOrAlbumHas, sortRows, trackFields, type Sort } from '../../library/views'

export interface FolderNode {
  // shown name: a music folder's last part
  name: string
  // -1 for a music folder
  parent: number
  // stays the same across scans, unlike the index: the open folder is kept by it
  key: string
  children: number[]
  // the folder's own songs, in library order (album, then disc and track)
  tracks: Track[]
  // songs here and in all subfolders
  count: number
  // the small cover of the first album inside that has one, or ''
  cover: string
}

export interface FolderTree {
  nodes: FolderNode[]
  // music folders, in settings order
  roots: number[]
  byKey: Map<string, number>
}

// No file name can hold \0, so keys can't mix up "/m/rock" (a music folder)
// with "rock" inside "/m".
const SEP = '\0'

export function rootName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

// Main sends parents before children, so one pass links them and one pass
// backwards adds up counts and covers from the bottom.
export function folderTree(
  folders: Folder[],
  tracks: Track[],
  albumCover: (albumId: string) => string
): FolderTree {
  const nodes: FolderNode[] = folders.map((f) => ({
    name: f.parent < 0 ? rootName(f.name) : f.name,
    parent: f.parent,
    key: '',
    children: [],
    tracks: [],
    count: 0,
    cover: ''
  }))
  const roots: number[] = []
  const byKey = new Map<string, number>()
  nodes.forEach((n, i) => {
    const p = nodes[n.parent]
    n.key = p ? p.key + SEP + n.name : folders[i].name
    if (p) p.children.push(i)
    else roots.push(i)
    byKey.set(n.key, i)
  })
  for (const t of tracks) nodes[t.folder]?.tracks.push(t)
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i]
    n.count += n.tracks.length
    for (const t of n.tracks) {
      if (n.cover) break
      n.cover = albumCover(t.albumId)
    }
    if (!n.cover) n.cover = n.children.map((c) => nodes[c].cover).find(Boolean) ?? ''
    const p = nodes[n.parent]
    if (p) p.count += n.count
  }
  return { nodes, roots, byKey }
}

export const emptyTree = (): FolderTree => ({ nodes: [], roots: [], byKey: new Map() })

// What Play plays: the subfolders in order, then the folder's own songs, as
// the page shows them. null is the top: every music folder.
export function folderSongs(tree: FolderTree, i: number | null): Track[] {
  const out: Track[] = []
  const walk = (j: number): void => {
    const n = tree.nodes[j]
    for (const c of n.children) walk(c)
    for (const t of n.tracks) out.push(t)
  }
  for (const j of i === null ? tree.roots : [i]) walk(j)
  return out
}

// The folder to show for a kept key. null is the top, which is the music
// folder itself when there is only one. A folder a rescan removed shows the
// nearest one above it.
export function shownFolder(tree: FolderTree, key: string | null): number | null {
  for (let k = key; k !== null;) {
    const i = tree.byKey.get(k)
    if (i !== undefined) return i
    const cut = k.lastIndexOf(SEP)
    k = cut < 0 ? null : k.slice(0, cut)
  }
  return tree.roots.length === 1 ? tree.roots[0] : null
}

// The search box's text in Folders: no "this folder" while the music
// folders are listed, or when there is none (no songs yet).
export function folderSearchText(tree: FolderTree, key: string | null): string {
  const i = shownFolder(tree, key)
  return i !== null && tree.nodes[i]?.count ? 'Search this folder' : 'Search folders'
}

// From the music folder down to this one.
export function crumbs(tree: FolderTree, i: number): number[] {
  const out: number[] = []
  for (let j = i; j >= 0; j = tree.nodes[j].parent) out.unshift(j)
  return out
}

// The deepest folder that holds all these songs' folders, so an album split
// into "CD1" and "CD2" gives their parent. null for none, or two music folders.
export function commonFolder(tree: FolderTree, folders: number[]): number | null {
  let shared: number[] | null = null
  for (const f of new Set(folders)) {
    if (!tree.nodes[f]) return null
    const path = crumbs(tree, f)
    if (!shared) shared = path
    let n = 0
    while (n < shared.length && shared[n] === path[n]) n++
    shared = shared.slice(0, n)
  }
  return shared?.at(-1) ?? null
}

// The music folder's full path, then each name down to this folder.
export const folderParts = (tree: FolderTree, i: number): string[] => tree.nodes[i].key.split(SEP)

// The page doesn't know the system's separator, so it takes the music folder's.
export function folderPath(parts: string[]): string {
  const [root, ...names] = parts
  const sep = root.includes('\\') && !root.includes('/') ? '\\' : '/'
  const base = root.endsWith(sep) ? root.slice(0, -1) : root
  return [base, ...names].join(sep)
}

// Search in a folder: its songs by title, artist or album, and the subfolders
// with a match anywhere in them (a folder name or a song), so you can go down
// to it. At the top, the music folders the same way. With fields (ticket
// 128), a folder found by its name shows only when a song in it has them.
export function filterFolder(
  tree: FolderTree,
  i: number | null,
  q: string,
  of = trackFields()
): { folders: number[]; songs: Track[] } {
  const folders = i === null ? tree.roots : tree.nodes[i].children
  const songs = i === null ? [] : tree.nodes[i].tracks
  const m = folderMatch(q, of)
  if (!m) return { folders, songs }
  const has = (j: number): boolean => {
    const n = tree.nodes[j]
    if (m.byName(n)) return !m.inNamed || anyBelow(tree, j, m.inNamed)
    return n.tracks.some(m.song) || n.children.some(has)
  }
  return { folders: folders.filter(has), songs: songs.filter(m.song) }
}

interface FolderMatch {
  // its name has the words to find
  byName(n: FolderNode): boolean
  // which songs of a folder found by name count: the ones with the fields
  // and no left-out word; null: all of them
  inNamed: ((t: Track) => boolean) | null
  // a song found by itself
  song(t: Track): boolean
}

// undefined for an empty search
function folderMatch(q: string, of: SongFields<Track>): FolderMatch | undefined {
  const p = parseQuery(q)
  if (!hasQuery(p)) return undefined
  const fields = p.terms.length ? songTest(p.terms, of) : null
  const rest: Query = { ...p, text: '' }
  return {
    // "-live" alone finds no folder by its name, only by its songs
    byName: (n) => !!p.text && hasText(p, foldedName(n)),
    inNamed:
      fields || p.not.length ? (t) => songOrAlbumHas(t, rest) && (!fields || fields(t)) : null,
    song: (t) => songOrAlbumHas(t, p) && (!fields || fields(t))
  }
}

function anyBelow(tree: FolderTree, j: number, test: (t: Track) => boolean): boolean {
  const n = tree.nodes[j]
  return n.tracks.some(test) || n.children.some((c) => anyBelow(tree, c, test))
}

// What Play plays in a folder: what the page shows. The shown subfolders
// first, each in folder order, then the folder's own songs in the table's
// sort. With a search, a subfolder plays only its songs that match, or all
// of it when its name matches (that is why it is shown), less the songs
// without the fields.
export function folderPlaySongs(
  tree: FolderTree,
  i: number | null,
  q: string,
  sort: Sort | null,
  order: (t: Track) => number,
  year?: (t: Track) => number,
  of = trackFields()
): Track[] {
  const m = folderMatch(q, of)
  const view = filterFolder(tree, i, q, of)
  const matches = (j: number): Track[] => {
    const n = tree.nodes[j]
    if (m!.byName(n)) {
      const all = folderSongs(tree, j)
      return m!.inNamed ? all.filter(m!.inNamed) : all
    }
    return [...n.children.flatMap(matches), ...n.tracks.filter(m!.song)]
  }
  const below = view.folders.flatMap((j) => (m ? matches(j) : folderSongs(tree, j)))
  return [...below, ...sortRows(view.songs, sort, order, year)]
}
