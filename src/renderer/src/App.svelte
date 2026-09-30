<script lang="ts">
  import { defaultPalettes } from '../../shared/palette'
  import TitleBar from './components/TitleBar.svelte'
  import Settings from './components/Settings.svelte'
  import CloseAsk from './components/CloseAsk.svelte'
  import Node from './layout/Node.svelte'
  import Menu from './ui/Menu.svelte'
  import Notice from './ui/Notice.svelte'
  import { engine } from './audio/engine'
  import {
    escapeTarget,
    isTyping,
    keyAction,
    seekStep,
    usesArrows,
    volumeStep,
    type KeyAction
  } from './keys'
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
  import { player } from './stores/player.svelte'
  import { playing } from './stores/playing.svelte'
  import { queue } from './stores/queue.svelte'
  import { settings, settingsState } from './stores/settings.svelte'
  import { theme } from './stores/theme.svelte'
  import { barColors } from './visualizer/colors'
  import { setLook } from './visualizer/loop'

  // each cover has a palette per theme; the light one has a darker accent
  const palettes = $derived(playing.art?.palette ?? defaultPalettes)
  const palette = $derived(palettes[theme.light ? 'light' : 'dark'])

  $effect(() => engine.setVolume(settings.volume))

  // The visualizer loop runs outside Svelte; it only hears about slow changes.
  $effect(() =>
    setLook({
      style: settings.visualizer,
      colors: barColors(palettes, theme.light),
      playing: player.playing
    })
  )

  // The library scan slows down while a song plays, so the audio gets the disk first.
  $effect(() => window.playbackApi.playing(player.playing))

  setupMediaSession()
  $effect(() => showInMediaSession(playing.media, playing.art))
  $effect(() => showSeekInMediaSession(playing.kind))
  $effect(() => showStateInMediaSession())
  $effect(() => showPositionInMediaSession(player.pos, player.duration))

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
    if (act === 'toggle') playing.togglePlay()
    else if (act === 'seekBack' || act === 'seekForward')
      playing.seek(seekStep(player.pos, player.duration, act === 'seekBack' ? -1 : 1))
    else if (act === 'volumeUp' || act === 'volumeDown')
      settings.volume = volumeStep(settings.volume, act === 'volumeDown' ? -1 : 1)
    else if (act === 'previous') void playing.prev()
    else if (act === 'next') void playing.next()
    else if (act === 'back') goBack()
    else if (act === 'forward') goForward()
    else if (act === 'search') focusSearch()
    else if (act === 'settings') layout.settingsOpen = !layout.settingsOpen
    else if (act === 'escape') escape()
    else if (act === 'visualizer') layout.cycleVisualizer()
    else if (act === 'queue') layout.toggleQueue()
  }

  function escape(): void {
    const drawer = layout.queueMode === 'drawer' && layout.showQueue
    const to = escapeTarget({ menu: !!menu.open, settings: layout.settingsOpen, drawer })
    if (to === 'menu') menu.close()
    else if (to === 'settings') layout.settingsOpen = false
    else if (to === 'drawer') layout.showQueue = false
  }

  // A drawer that turns back into a Column hands its focus on to the Column.
  function resized(width: number): void {
    const at = layout.queueMode === 'drawer' ? drawerFocus() : null
    layout.resized(width)
    if (at !== null && layout.queueMode === 'col') focusColumnQueue(at)
  }

  // Focus has no search box; there the key does nothing.
  function focusSearch(): void {
    const box = document.querySelector<HTMLInputElement>('input[data-search]')
    if (!box) return
    layout.settingsOpen = false
    box.focus()
    box.select()
  }
</script>

<!-- the last position goes to main before the window closes; the width picks
     how a queue Column is drawn (layout/narrow.ts) -->
<svelte:window
  {onkeydown}
  onmouseup={onSideButton}
  onpagehide={() => queue.savePos()}
  bind:innerWidth={null, resized}
/>

<div
  class="app vz-{settings.visualizer}"
  class:playing={player.playing}
  class:song-playing={playing.songPlaying}
  style:--c1={palette[0]}
  style:--c2={palette[1]}
  style:--c3={palette[2]}
>
  <TitleBar
    title="Spindle · {layout.template.name}"
    settingsOpen={layout.settingsOpen}
    onSettings={() => (layout.settingsOpen = !layout.settingsOpen)}
  />
  <main class="winbody">
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
