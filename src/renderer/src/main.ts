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

// Settings and the library first, so the first paint already shows the saved
// template and the albums. The window stays hidden until then, so the wait doesn't show.
const [saved, lib, lists, lastQueue] = await Promise.all([
  window.settingsApi.load(),
  window.libraryApi.load(),
  window.playlistsApi.load(),
  window.playbackApi.loadQueue()
])
loadSettings(saved)
library.load(decodeLibrary(lib.library))
library.status = lib.status
playlists.load(lists)
// paused where it was; songs no longer in the library leave the queue
queue.restore(lastQueue)

window.libraryApi.onChanged((bytes) => {
  library.load(decodeLibrary(bytes))
  queue.prune()
})
window.libraryApi.onStatus((s) => (library.status = s))

const app = mount(App, {
  target: document.getElementById('app')!
})

export default app
