import { mount } from 'svelte'

import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/onest'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './assets/theme.css'
import './assets/text.css'
import './assets/controls.css'

import App from './App.svelte'
import { files, decodeLibrary } from './plugins/files/store.svelte'
import { LibraryFeed } from './stores/library-feed'
import { layout } from './stores/layout.svelte'
import { notice } from './stores/notice.svelte'
import { playlists } from './stores/playlists.svelte'
import { queues } from './stores/queues.svelte'
import { queue } from './stores/queue.svelte'
import { radio } from './plugins/radio/store.svelte'
import { mfp } from './plugins/mfp/store.svelte'
import { loadSettings } from './stores/settings.svelte'
import { dropText, ScanWatch } from './library/scan-text'
import { orFallback } from './start'
import { emptyQueues } from '../../shared/saved-queue'
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

// A file dropped on the window would replace the app (main blocks that too),
// so the page takes every drop itself. Only files from the system count:
// the folders among them become music folders (main checks each path).
window.addEventListener('dragover', (e) => {
  e.preventDefault()
  if (e.dataTransfer)
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'none'
})
window.addEventListener('drop', (e) => {
  e.preventDefault()
  const files = [...(e.dataTransfer?.files ?? [])]
  if (!files.length) return
  void window.libraryApi.addDropped(files).then((r) => {
    const text = dropText(r)
    if (text) notice.show(text)
  })
})

// MFP's news from main, also while the page waits for its first answer.
const mfpHeard = { episodes: false, status: false }
window.mfpApi.onEpisodes((d) => {
  mfpHeard.episodes = true
  mfp.load(d)
})
window.mfpApi.onStatus((s) => {
  mfpHeard.status = true
  mfp.status = s
})

// Settings and the library first, so the first paint already shows the saved
// template and the albums. The window stays hidden until then, so the wait doesn't show.
// A failed ask shows the app with defaults. Settings and playlists that failed
// to load are not saved this run, so the defaults can't replace the user's files.
const [saved, lib, lists, lastQueue, stations, mixes] = await Promise.all([
  orFallback(() => window.settingsApi.load(), defaultSettings(), 'the settings'),
  orFallback<{ library?: Uint8Array; status: ScanStatus; moves?: IdMoves }>(
    () => window.libraryApi.load(),
    { status: files.status },
    'the library'
  ),
  orFallback(() => window.playlistsApi.load(), [], 'the playlists'),
  orFallback(() => window.playbackApi.loadQueue(), emptyQueues(), 'the queue'),
  orFallback(() => window.radioApi.stations(), [], 'the radio stations'),
  orFallback(
    () =>
      window.mfpApi.get().then((d) => {
        // news from before the answer is in it
        mfpHeard.episodes = mfpHeard.status = false
        return d
      }),
    { episodes: [] },
    'the MFP episodes'
  )
])
loadSettings(saved.value, saved.ok)
files.status = lib.value.status
files.loadFailed = !lib.ok
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
  const { now, later } = splitMoves(moves, (id) => files.has(id))
  startLists = movePlaylists(startLists, now)
  startQueue = moveQueue(startQueue, now)
  moves = Object.keys(later).length ? later : undefined
}
playlists.load(startLists, lists.ok)
// My stations that could not be read stay not loaded: a saved station is
// then not taken for gone (queues.restore).
if (stations.ok) radio.load(stations.value)
// news that came after main's answer is newer than it
if (!mfpHeard.episodes) mfp.load(mixes.value)
if (!mfpHeard.status) mfp.status = mixes.value.status
// paused where it was; songs their plugin says are gone leave the queue.
// A live item (a station) comes back picked, paused.
queues.restore(startQueue)

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
function applyLibrary(m: LibraryMessage): void {
  if (moves) {
    queue.moveIds(moves)
    playlists.moveIds(moves)
    moves = undefined
  }
  if ('patch' in m) files.patch(m)
  else files.load(m)
  files.loadFailed = false
}

// While a scan runs, main sends what changed (ticket 022).
const feed = new LibraryFeed({
  have: () => files.sent,
  apply: applyLibrary,
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

const app = mount(App, {
  target: document.getElementById('app')!
})

export default app
