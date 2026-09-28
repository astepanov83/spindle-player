// The Folders view (ticket 020): the folder tree from main's folder table,
// search, and mouse Back and Forward between a folder and its subfolders. No DOM.
import type { Folder, Track } from '../../../shared/library'
import { sortRows, type Sort } from './views'

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

// From the music folder down to this one.
export function crumbs(tree: FolderTree, i: number): number[] {
  const out: number[] = []
  for (let j = i; j >= 0; j = tree.nodes[j].parent) out.unshift(j)
  return out
}

// The key of the folder above: null for the list of music folders, undefined
// when there is nothing above (the top, or the only music folder).
export function folderUp(tree: FolderTree, i: number | null): string | null | undefined {
  if (i === null) return undefined
  const p = tree.nodes[i].parent
  if (p >= 0) return tree.nodes[p].key
  return tree.roots.length > 1 ? null : undefined
}

// The open folder, and the folders mouse Back left (the latest last), for Forward.
export interface FolderNav {
  folder: string | null
  below: string[]
}

const keyOf = (tree: FolderTree, i: number | null): string | null =>
  i === null ? null : tree.nodes[i].key

export function openFolder(nav: FolderNav, key: string | null): FolderNav {
  const below = nav.below.at(-1) === key ? nav.below.slice(0, -1) : []
  return { folder: key, below }
}

export function folderBack(tree: FolderTree, nav: FolderNav): FolderNav {
  const i = shownFolder(tree, nav.folder)
  const up = folderUp(tree, i)
  if (up === undefined || i === null) return nav
  return { folder: up, below: [...nav.below, tree.nodes[i].key] }
}

// Forward opens the folder Back left last, if it is still there and right
// below the one shown.
export function folderForward(tree: FolderTree, nav: FolderNav): FolderNav {
  const key = nav.below.at(-1)
  if (key === undefined) return nav
  const i = tree.byKey.get(key)
  const here = keyOf(tree, shownFolder(tree, nav.folder))
  if (i === undefined || folderUp(tree, i) !== here) return { folder: nav.folder, below: [] }
  return { folder: key, below: nav.below.slice(0, -1) }
}

// Search in a folder: its songs by title, artist or album, and the subfolders
// with a match anywhere in them (a folder name or a song), so you can go down
// to it. At the top, the music folders the same way.
export function filterFolder(
  tree: FolderTree,
  i: number | null,
  q: string
): { folders: number[]; songs: Track[] } {
  const s = q.trim().toLowerCase()
  const folders = i === null ? tree.roots : tree.nodes[i].children
  const songs = i === null ? [] : tree.nodes[i].tracks
  if (!s) return { folders, songs }
  const has = (j: number): boolean => {
    const n = tree.nodes[j]
    return n.name.toLowerCase().includes(s) || n.tracks.some(songMatches(s)) || n.children.some(has)
  }
  return { folders: folders.filter(has), songs: songs.filter(songMatches(s)) }
}

const songMatches =
  (s: string) =>
  (t: Track): boolean =>
    (t.title + '\n' + t.artist + '\n' + t.album).toLowerCase().includes(s)

// What Play plays in a folder: what the page shows. The shown subfolders
// first, each in folder order, then the folder's own songs in the table's
// sort. With a search, a subfolder plays only its songs that match, or all
// of it when its name matches (that is why it is shown).
export function folderPlaySongs(
  tree: FolderTree,
  i: number | null,
  q: string,
  sort: Sort | null,
  order: (t: Track) => number
): Track[] {
  const s = q.trim().toLowerCase()
  const view = filterFolder(tree, i, q)
  const matches = (j: number): Track[] => {
    const n = tree.nodes[j]
    if (n.name.toLowerCase().includes(s)) return folderSongs(tree, j)
    return [...n.children.flatMap(matches), ...n.tracks.filter(songMatches(s))]
  }
  const below = view.folders.flatMap((j) => (s ? matches(j) : folderSongs(tree, j)))
  return [...below, ...sortRows(view.songs, sort, order)]
}
