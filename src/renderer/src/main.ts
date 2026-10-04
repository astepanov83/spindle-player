import { mount } from 'svelte'

import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/onest'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './assets/theme.css'
import './assets/text.css'
import './assets/controls.css'

import App from './App.svelte'
import { startAi } from './ai.svelte'
import { playlists } from './stores/playlists.svelte'
import { queues } from './stores/queues.svelte'
import { queue } from './stores/queue.svelte'
import { loadSettings } from './stores/settings.svelte'
import { dropOn, startPlugins, takesDrops } from './plugins'
import { orFallback } from './start'
import { moveQueue, movePlaylists } from '../../shared/id-moves'
import { emptyQueues } from '../../shared/saved-queue'
import { defaultSettings } from '../../shared/settings'

// A file dropped on the window would replace the app (main blocks that too),
// so the page takes every drop itself. Only files from the system count, and
// only while a plugin that takes them is on.
window.addEventListener('dragover', (e) => {
  e.preventDefault()
  if (e.dataTransfer)
    e.dataTransfer.dropEffect =
      e.dataTransfer.types.includes('Files') && takesDrops() ? 'copy' : 'none'
})
window.addEventListener('drop', (e) => {
  e.preventDefault()
  const dropped = [...(e.dataTransfer?.files ?? [])]
  if (dropped.length) dropOn(dropped)
})

// Settings and the plugins' data first, so the first paint already shows the
// saved template and the albums. The window stays hidden until then, so the
// wait doesn't show. A failed ask shows the app with defaults. Settings and
// playlists that failed to load are not saved this run, so the defaults can't
// replace the user's files.
const [saved, lists, lastQueue, started] = await Promise.all([
  orFallback(() => window.settingsApi.load(), defaultSettings(), 'the settings'),
  orFallback(() => window.playlistsApi.load(), [], 'the playlists'),
  orFallback(() => window.playbackApi.loadQueue(), emptyQueues(), 'the queue'),
  startPlugins()
])
loadSettings(saved.value, saved.ok)
// not waited for: Settings shows the AI part when it arrives
startAi(window.aiApi)

// Ids a plugin moved are renamed before the playlists and the queue load, so
// the queue doesn't drop those songs.
let startLists = lists.value
let startQueue = lastQueue.value
for (const { plugin, moves } of started.load()) {
  startLists = movePlaylists(startLists, plugin, moves)
  startQueue = moveQueue(startQueue, plugin, moves)
}
playlists.load(startLists, lists.ok)
// paused where it was; songs their plugin says are gone leave the queue.
// A live item (a station) comes back picked, paused.
queues.restore(startQueue)
started.listen((plugin, moves) => {
  queue.moveIds(plugin, moves)
  playlists.moveIds(plugin, moves)
})

const app = mount(App, {
  target: document.getElementById('app')!
})

export default app
