import { mount } from 'svelte'

import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/onest'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './assets/theme.css'
import './assets/text.css'

import App from './App.svelte'
import { decodeLibrary, library } from './stores/library.svelte'
import { LibraryFeed } from './stores/library-feed'
import { layout } from './stores/layout.svelte'
import { notice } from './stores/notice.svelte'
import { playlists } from './stores/playlists.svelte'
import { playing } from './stores/playing.svelte'
import { queue } from './stores/queue.svelte'
import { radio } from './stores/radio.svelte'
import { loadSettings } from './stores/settings.svelte'
import { ScanWatch } from './library/scan-text'
import { orFallback } from './start'
import { emptyQueue } from '../../shared/saved-queue'
import { defaultSettings } from '../../shared/settings'
import type { ScanStatus } from '../../shared/library'
import type { LibraryMessage } from '../../shared/library-patch'
import {
  mergeMoves,
  moveQueue,
  movePlaylists,
  splitMoves,
  type IdMoves
} from '../../shared/id-moves'

// A file dropped on the window would replace the app (main blocks that too).
// Nothing in the page takes drops yet.
for (const type of ['dragover', 'drop'] as const)
  window.addEventListener(type, (e) => e.preventDefault())

// Settings and the library first, so the first paint already shows the saved
// template and the albums. The window stays hidden until then, so the wait doesn't show.
// A failed ask shows the app with defaults. Settings and playlists that failed
// to load are not saved this run, so the defaults can't replace the user's files.
const [saved, lib, lists, lastQueue, stations] = await Promise.all([
  orFallback(() => window.settingsApi.load(), defaultSettings(), 'the settings'),
  orFallback<{ library?: Uint8Array; status: ScanStatus; moves?: IdMoves }>(
    () => window.libraryApi.load(),
    { status: library.status },
    'the library'
  ),
  orFallback(() => window.playlistsApi.load(), [], 'the playlists'),
  orFallback(() => window.playbackApi.loadQueue(), emptyQueue(), 'the queue'),
  orFallback(() => window.radioApi.stations(), [], 'the radio stations')
])
loadSettings(saved.value, saved.ok)
library.status = lib.value.status
library.loadFailed = !lib.ok
if (lib.value.library) loadLibrary(lib.value.library)

// Ids that changed come just before the library that has the new ones, and
// are renamed as it loads, so the queue doesn't drop those songs. The maps of
// this run so far come with the load (one sent at start can come before the
// page listens); those may be for this library already.
let moves: IdMoves | undefined = lib.value.moves
window.libraryApi.onIdsMoved((m) => (moves = moves ? mergeMoves(moves, m) : m))
let startLists = lists.value
let startQueue = lastQueue.value
if (moves) {
  const { now, later } = splitMoves(moves, (id) => library.has(id))
  startLists = movePlaylists(startLists, now)
  startQueue = moveQueue(startQueue, now)
  moves = Object.keys(later).length ? later : undefined
}
playlists.load(startLists, lists.ok)
radio.load(stations.value)
// paused where it was; songs no longer in the library leave the queue.
// Radio comes back with its station, paused.
playing.restore(startQueue, stations.ok)

// A library that can't be read leaves the one shown as it is.
function loadLibrary(bytes: Uint8Array): boolean {
  try {
    const m = decodeLibrary(bytes)
    if ('patch' in m) throw new Error('a patch, not a whole library')
    library.load(m)
  } catch (e) {
    console.error('Could not read the library', e)
    library.loadFailed = true
    return false
  }
  library.loadFailed = false
  return true
}

// Ids that changed are renamed as the library with the new ones loads.
function applyLibrary(m: LibraryMessage): void {
  if (moves) {
    queue.moveIds(moves)
    playlists.moveIds(moves)
    moves = undefined
  }
  const gone = 'patch' in m ? library.patch(m) : (library.load(m), true)
  library.loadFailed = false
  if (gone) queue.prune()
}

// While a scan runs, main sends what changed (ticket 022).
const feed = new LibraryFeed({
  have: () => library.sent,
  apply: applyLibrary,
  fetch: async () => decodeLibrary(await window.libraryApi.get()),
  fail: (e) => {
    console.error('Could not get the library', e)
    library.loadFailed = true
  }
})

window.libraryApi.onChanged((bytes) => {
  let m: LibraryMessage
  try {
    m = decodeLibrary(bytes)
  } catch (e) {
    console.error('Could not read the library', e)
    library.loadFailed = true
    return
  }
  feed.take(m)
})
// A failed scan or a folder not found shows only in the settings sheet, so
// the main window says so too (ticket 045).
const scanWatch = new ScanWatch(library.status)
window.libraryApi.onStatus((s) => {
  library.status = s
  const text = scanWatch.next(s)
  if (text && !layout.settingsOpen)
    notice.show(text, { label: 'Open Settings', run: () => (layout.settingsOpen = true) })
})

const app = mount(App, {
  target: document.getElementById('app')!
})

export default app
