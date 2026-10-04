// Music files at start: the library from the index, and the news main sends
// after it (patches, scan lines, ids that moved).
import { mergeMoves, splitMoves, type IdMoves } from '../../../../shared/id-moves'
import type { ScanStatus } from '../../../../shared/library'
import type { LibraryMessage } from '../../../../shared/plugins/files/library-patch'
import { orFallback } from '../../start'
import { layout } from '../../stores/layout.svelte'
import { notice } from '../../stores/notice.svelte'
import type { PluginStart } from '../types'
import { LibraryFeed } from './library-feed'
import { ScanWatch } from './scan-text'
import { decodeLibrary, files } from './store.svelte'

// Ids that changed come just before the library that has the new ones, and
// are renamed as it loads, so the queue doesn't drop those songs.
let moves: IdMoves | undefined

// A library that can't be read leaves the one shown as it is.
function loadLibrary(bytes: Uint8Array): boolean {
  try {
    const m = decodeLibrary(bytes)
    if ('patch' in m) throw new Error('a patch, not a whole library')
    files.load(m)
  } catch (e) {
    console.error('Could not read the library', e)
    files.loadFailed = true
    return false
  }
  files.loadFailed = false
  return true
}

// Ids that changed are renamed as the library with the new ones loads, before
// the queue drops songs that are gone (queue.refresh, from App.svelte).
function applyLibrary(m: LibraryMessage, idsMoved: (moves: IdMoves) => void): void {
  if (moves) {
    idsMoved(moves)
    moves = undefined
  }
  if ('patch' in m) files.patch(m)
  else files.load(m)
  files.loadFailed = false
}

function listen(idsMoved: (moves: IdMoves) => void): void {
  // While a scan runs, main sends what changed (ticket 022).
  const feed = new LibraryFeed({
    have: () => files.sent,
    apply: (m) => applyLibrary(m, idsMoved),
    fetch: async () => decodeLibrary(await window.libraryApi.get()),
    fail: (e) => {
      console.error('Could not get the library', e)
      files.loadFailed = true
    }
  })
  window.libraryApi.onChanged((bytes) => {
    let m: LibraryMessage
    try {
      m = decodeLibrary(bytes)
    } catch (e) {
      console.error('Could not read the library', e)
      files.loadFailed = true
      return
    }
    feed.take(m)
  })
  // A failed scan or a folder not found shows only in the settings sheet, so
  // the main window says so too (ticket 045).
  const scanWatch = new ScanWatch(files.status)
  window.libraryApi.onStatus((s) => {
    files.status = s
    const text = scanWatch.next(s)
    if (text && !layout.settingsOpen)
      notice.show(text, { label: 'Open Settings', run: () => (layout.settingsOpen = true) })
  })
}

export async function startFiles(): Promise<PluginStart> {
  // the first paint shows the albums
  const lib = await orFallback<{ library?: Uint8Array; status: ScanStatus; moves?: IdMoves }>(
    () => window.libraryApi.load(),
    { status: files.status },
    'the library'
  )
  return {
    load: () => {
      files.status = lib.value.status
      files.loadFailed = !lib.ok
      if (lib.value.library) loadLibrary(lib.value.library)
      // The maps of this run so far come with the load (one sent at start can
      // come before the page listens); those may be for this library already.
      moves = lib.value.moves
      window.libraryApi.onIdsMoved((m) => (moves = moves ? mergeMoves(moves, m) : m))
      if (!moves) return undefined
      const { now, later } = splitMoves(moves, (id) => files.has(id))
      moves = Object.keys(later).length ? later : undefined
      return now
    },
    listen
  }
}
