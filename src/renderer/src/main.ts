import { mount } from 'svelte'

import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/onest'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './assets/theme.css'

import App from './App.svelte'
import { decodeLibrary, library } from './stores/library.svelte'
import { playlists } from './stores/playlists.svelte'
import { queue } from './stores/queue.svelte'
import { loadSettings } from './stores/settings.svelte'
import { orFallback } from './start'
import { emptyQueue } from '../../shared/saved-queue'
import { defaultSettings } from '../../shared/settings'
import type { ScanStatus } from '../../shared/library'
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
const [saved, lib, lists, lastQueue] = await Promise.all([
  orFallback(() => window.settingsApi.load(), defaultSettings(), 'the settings'),
  orFallback<{ library?: Uint8Array; status: ScanStatus }>(
    () => window.libraryApi.load(),
    { status: library.status },
    'the library'
  ),
  orFallback(() => window.playlistsApi.load(), [], 'the playlists'),
  orFallback(() => window.playbackApi.loadQueue(), emptyQueue(), 'the queue')
])
loadSettings(saved.value, saved.ok)
library.status = lib.value.status
library.loadFailed = !lib.ok
if (lib.value.library) loadLibrary(lib.value.library)

// Ids that changed come just before the library that has the new ones, and
// are renamed as it loads, so the queue doesn't drop those songs. A map that
// came before now (sent again at start) may be for this library already.
let moves: IdMoves | undefined
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
// paused where it was; songs no longer in the library leave the queue
queue.restore(startQueue)

// A library that can't be read leaves the one shown as it is.
function loadLibrary(bytes: Uint8Array): boolean {
  try {
    library.load(decodeLibrary(bytes))
  } catch (e) {
    console.error('Could not read the library', e)
    library.loadFailed = true
    return false
  }
  library.loadFailed = false
  return true
}

window.libraryApi.onChanged((bytes) => {
  if (moves) {
    queue.moveIds(moves)
    playlists.moveIds(moves)
    moves = undefined
  }
  if (loadLibrary(bytes)) queue.prune()
})
window.libraryApi.onStatus((s) => (library.status = s))

const app = mount(App, {
  target: document.getElementById('app')!
})

export default app
