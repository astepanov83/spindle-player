<script lang="ts">
  import { untrack } from 'svelte'
  import { defaultPalettes } from '../../shared/palette'
  import TitleBar from './components/TitleBar.svelte'
  import Settings from './components/Settings.svelte'
  import { keysSection } from './components/settings-sections'
  import CloseAsk from './components/CloseAsk.svelte'
  import Node from './layout/Node.svelte'
  import Menu from './ui/Menu.svelte'
  import Notice from './ui/Notice.svelte'
  import { engine } from './audio/engine'
  import { heard } from './audio/volume'
  import { escapeTarget, isTyping, keyAction, seekStep, usesArrows, type KeyAction } from './keys'
  import { goBack, goForward, onSideButton } from './library/side-buttons'
  import { drawerFocus, focusColumnQueue } from './layout/queue-focus'
  import { layout } from './stores/layout.svelte'
  import { menu } from './stores/menu.svelte'
  import {
    setupMediaSession,
    showInMediaSession,
    showPositionInMediaSession,
    showSeekInMediaSession,
    showStateInMediaSession
  } from './stores/media-session'
  import { playStateOf } from './stores/play-state'
  import { itemsVersion, navTabs } from './plugins'
  import { library } from './stores/library.svelte'
  import { player } from './stores/player.svelte'
  import { queues } from './stores/queues.svelte'
  import { queue } from './stores/queue.svelte'
  import { settings, settingsState } from './stores/settings.svelte'
  import { sound, stepVolume, toggleMute } from './stores/sound.svelte'
  import { theme } from './stores/theme.svelte'
  import { barColors } from './visualizer/colors'
  import { setLook } from './visualizer/loop'

  // each cover has a palette per theme; the light one has a darker accent
  const palettes = $derived(queues.art?.palette ?? defaultPalettes)
  const palette = $derived(palettes[theme.light ? 'light' : 'dark'])

  $effect(() => engine.setVolume(heard({ volume: settings.volume, muted: sound.muted })))

  // The visualizer loop runs outside Svelte; it only hears about slow changes.
  $effect(() =>
    setLook({
      style: settings.visualizer,
      colors: barColors(palettes, theme.light),
      playing: player.playing
    })
  )

  // New data in a plugin, or one turned on or off: songs that are gone leave
  // the queue, a song that waited for its plugin loads, a live item whose
  // plugin went off gives the player back to the queue, and pages that are
  // gone close. A $derived, so a read that changes without changing the
  // version (the scan status, every 100 ms in a scan) doesn't run them.
  const version = $derived(itemsVersion())
  $effect(() => {
    void version
    untrack(() => {
      queues.refresh()
      library.pagesChanged()
    })
  })

  // The library's tabs follow the plugins that are on: one turned off takes
  // its tabs, pages and history steps with it. .pre, so the library is drawn
  // with them from the start.
  $effect.pre(() => {
    const tabs = navTabs()
    untrack(() => library.setTabs(tabs))
  })

  // The library scan slows down while a song plays, so the audio gets the disk first.
  $effect(() => window.playbackApi.playing(player.playing))

  setupMediaSession()
  $effect(() => showInMediaSession(queues.media, queues.art))
  $effect(() => showSeekInMediaSession(queues.active))
  $effect(() => showStateInMediaSession())
  $effect(() => showPositionInMediaSession(player.pos, player.duration))

  // The tray menu shows what plays and has Play, Next and Previous (ticket 088).
  $effect(() => window.playbackApi.state(playStateOf(queues)))
  $effect(() =>
    window.playbackApi.onControl((c) => {
      // the menu can be a step behind the page
      if (queues.nothing) return
      if (c === 'toggle') queues.togglePlay()
      else if (c === 'next') void queues.next()
      else if (c === 'previous') void queues.prev()
    })
  )

  // Every change goes to main, which saves it and applies the window size and
  // theme. Settings that failed to load are applied but not saved.
  $effect(() => {
    const s = $state.snapshot(settings)
    window.settingsApi.save(s, settingsState.canSave)
  })

  // The keys, decided in keys.ts (list in docs/design.md). A key a list, the
  // seek bar or the search box already used arrives with defaultPrevented.
  function onkeydown(e: KeyboardEvent): void {
    if (e.defaultPrevented) return
    const t = e.target as HTMLElement
    const act = keyAction(e, { typing: isTyping(t), arrows: usesArrows(t), menuOpen: !!menu.open })
    if (act === 'none') return
    // Space never presses a focused button, with or without a modifier
    e.preventDefault()
    run(act)
  }

  function run(act: KeyAction): void {
    if (act === 'toggle') queues.togglePlay()
    else if (act === 'seekBack' || act === 'seekForward')
      queues.seek(seekStep(player.pos, player.duration, act === 'seekBack' ? -1 : 1))
    else if (act === 'volumeUp' || act === 'volumeDown') stepVolume(act === 'volumeDown' ? -1 : 1)
    else if (act === 'mute') toggleMute()
    else if (act === 'previous') void queues.prev()
    else if (act === 'next') void queues.next()
    else if (act === 'back') goBack()
    else if (act === 'forward') goForward()
    else if (act === 'search') focusSearch()
    else if (act === 'settings') layout.toggleSettings()
    else if (act === 'keys') toggleKeys()
    else if (act === 'escape') escape()
    else if (act === 'visualizer') layout.cycleVisualizer()
    else if (act === 'queue') layout.toggleQueue()
    else if (act === 'studio' || act === 'classic' || act === 'focus') layout.chooseTemplate(act)
  }

  function escape(): void {
    const drawer = layout.queueMode === 'drawer' && layout.showQueue
    const to = escapeTarget({ menu: !!menu.open, settings: layout.settingsOpen, drawer })
    if (to === 'menu') menu.close()
    else if (to === 'settings') layout.closeSettings()
    else if (to === 'drawer') layout.showQueue = false
  }

  // ? opens Settings on the key list, and closes it from there
  function toggleKeys(): void {
    if (layout.settingsAt === keysSection) layout.closeSettings()
    else layout.openSettings(keysSection)
  }

  // A drawer that turns back into a Column hands its focus on to the Column.
  function resized(): void {
    const at = layout.queueMode === 'drawer' ? drawerFocus() : null
    layout.resized(window.innerWidth, window.innerHeight)
    if (at !== null && layout.queueMode === 'col') focusColumnQueue(at)
  }

  // Focus has no search box; there the key does nothing.
  function focusSearch(): void {
    const box = document.querySelector<HTMLInputElement>('input[data-search]')
    if (!box) return
    layout.closeSettings()
    box.focus()
    box.select()
  }
</script>

<!-- the last position goes to main before the window closes; the size picks
     how a queue Column is drawn (layout/narrow.ts) and the wide layout (layout/wide.ts) -->
<svelte:window
  {onkeydown}
  onmouseup={onSideButton}
  onpagehide={() => queue.savePos()}
  onresize={resized}
/>

<div
  class="app vz-{settings.visualizer}"
  class:playing={player.playing}
  class:song-playing={queues.songPlaying}
  style:--c1={palette[0]}
  style:--c2={palette[1]}
  style:--c3={palette[2]}
>
  <TitleBar
    title="Spindle · {layout.template.name}"
    settingsOpen={layout.settingsOpen}
    onSettings={() => layout.toggleSettings()}
  />
  <!-- inert under the Settings page, so Tab and clicks stay on the page -->
  <main class="winbody" inert={layout.settingsOpen}>
    <Node node={layout.built.root} />
  </main>
  {#if layout.settingsOpen}<Settings />{/if}
  <Notice />
  <Menu />
  <CloseAsk />
</div>

<style>
  .app {
    height: 100%;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
    background: var(--bg);
  }
  .winbody {
    flex: 1;
    display: flex;
    min-height: 0;
    position: relative;
  }
</style>
