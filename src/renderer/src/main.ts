import { mount } from 'svelte'

import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/onest'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './assets/theme.css'

import App from './App.svelte'
import { library } from './stores/library.svelte'
import { queue } from './stores/queue.svelte'
import { loadSettings } from './stores/settings.svelte'

// Settings and the library first, so the first paint already shows the saved
// template and the albums. The window stays hidden until then, so the wait doesn't show.
const [saved, lib] = await Promise.all([window.settingsApi.load(), window.libraryApi.load()])
loadSettings(saved)
library.load(lib.library)
library.status = lib.status

window.libraryApi.onChanged((data) => {
  library.load(data)
  queue.prune()
})
window.libraryApi.onStatus((s) => (library.status = s))

const app = mount(App, {
  target: document.getElementById('app')!
})

export default app
