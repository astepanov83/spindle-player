// Files and folders dropped on the window, or given by the system ("Open
// with", the command line; ticket 124). Folders become music folders (ticket
// 047); songs play (see loose-songs.ts). The page can't make a path up: the
// preload gets each one from webUtils.getPathForFile, which knows only files
// dragged in from the system. Main still checks every path, since a message
// from the page can't be trusted: only absolute paths to folders and songs
// that exist are taken.
import { basename } from 'path'
import { maxDropped, type DropResult } from '../../../shared/plugins/files/ipc'
import { parseFolders } from '../../../shared/settings'
import { isAudioFile, isCueFile } from './tags'

// What a path is on disk: a folder, a song (an audio file or a cue sheet), or
// neither (another file, or nothing there). `stat` asks the disk (fs.stat in main).
export async function pathKind(
  path: string,
  stat: (path: string) => Promise<{ isDirectory(): boolean; isFile(): boolean }>
): Promise<'dir' | 'song' | undefined> {
  let s
  try {
    s = await stat(path)
  } catch {
    return undefined
  }
  if (s.isDirectory()) return 'dir'
  const name = basename(path)
  return s.isFile() && (isAudioFile(name) || isCueFile(name)) ? 'song' : undefined
}

export interface SortedPaths {
  dirs: string[]
  // in the order given
  songs: string[]
  // neither, or not an absolute path
  other: number
}

// The page's list of dropped paths, as absolute paths without a trailing
// slash; none when it is not a list or longer than a drop can be.
export function droppedPaths(paths: unknown): string[] | undefined {
  if (!Array.isArray(paths) || paths.length > maxDropped) return undefined
  return paths
}

// Sorts paths by what they are; `kind` asks the disk (pathKind).
export async function sortPaths(
  paths: unknown[],
  kind: (path: string) => Promise<'dir' | 'song' | undefined>
): Promise<SortedPaths> {
  const r: SortedPaths = { dirs: [], songs: [], other: 0 }
  for (const raw of paths) {
    // absolute, without a trailing slash, as the settings keep it
    const p = parseFolders([raw])[0]
    const k = p === undefined ? undefined : await kind(p)
    if (p === undefined || !k) r.other++
    else if (k === 'dir') {
      if (!r.dirs.includes(p)) r.dirs.push(p)
    } else if (!r.songs.includes(p)) r.songs.push(p)
  }
  return r
}

// What addFolders needs of main's settings store.
export interface FolderStore {
  // false when settings.json could not be read: the list then can't change
  readonly readable: boolean
  get(): { folders: string[] }
}

// The folders of a drop that are not music folders yet are added. The list is
// read after the disk answered, since the folder picker may have changed it
// meanwhile.
export function addFolders(
  dirs: string[],
  store: FolderStore,
  setFolders: (folders: string[]) => void
): Pick<DropResult, 'added' | 'known' | 'unreadable'> {
  if (!dirs.length) return { added: [], known: 0 }
  if (!store.readable) return { added: [], known: 0, unreadable: true }
  const folders = store.get().folders
  const added = dirs.filter((d) => !folders.includes(d))
  if (added.length) setFolders([...folders, ...added])
  return { added, known: dirs.length - added.length }
}
