import { mount } from 'svelte'

import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/onest'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './assets/theme.css'

import App from './App.svelte'
import { loadSettings } from './stores/settings.svelte'

// Settings first, so the first paint already shows the saved template.
// The window stays hidden until then, so the wait doesn't show.
loadSettings(await window.settingsApi.load())

const app = mount(App, {
  target: document.getElementById('app')!
})

export default app
