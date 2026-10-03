// Folders dropped on the window become music folders (ticket 047). The page
// can't make a path up: the preload gets each one from webUtils.getPathForFile,
// which knows only files dragged in from the system. Main still checks every
// path, since a message from the page can't be trusted: only absolute paths to
// folders that exist are added.
import { maxDropped, type DropResult } from '../../../shared/ipc'
import { parseFolders } from '../../../shared/settings'

// `folders` are the music folders now; `isDir` asks the disk (fs.stat in main).
export async function droppedFolders(
  paths: unknown,
  folders: string[],
  isDir: (path: string) => Promise<boolean>
): Promise<DropResult> {
  const r: DropResult = { added: [], known: 0, other: 0 }
  if (!Array.isArray(paths) || paths.length > maxDropped) return r
  for (const raw of paths) {
    // absolute, without a trailing slash, as the settings keep it
    const p = parseFolders([raw])[0]
    if (p === undefined || !(await isDir(p))) r.other++
    else if (folders.includes(p)) r.known++
    else if (!r.added.includes(p)) r.added.push(p)
  }
  return r
}

// What addDropped needs of main's settings store.
export interface FolderStore {
  // false when settings.json could not be read: the list then can't change
  readonly readable: boolean
  get(): { folders: string[] }
}

// The library service's part of a drop. The list is read again after the
// disk answered, since the folder picker may have changed it meanwhile.
export async function addDropped(
  paths: unknown,
  store: FolderStore,
  isDir: (path: string) => Promise<boolean>,
  setFolders: (folders: string[]) => void
): Promise<DropResult> {
  if (!store.readable) return { added: [], known: 0, other: 0, unreadable: true }
  const r = await droppedFolders(paths, store.get().folders, isDir)
  if (r.added.length) setFolders([...store.get().folders, ...r.added])
  return r
}
