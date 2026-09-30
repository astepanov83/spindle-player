<script lang="ts">
  import { defaultPalettes } from '../../shared/palette'
  import TitleBar from './components/TitleBar.svelte'
  import Settings from './components/Settings.svelte'
  import Node from './layout/Node.svelte'
  import Menu from './ui/Menu.svelte'
  import Notice from './ui/Notice.svelte'
  import { engine } from './audio/engine'
  import { isTyping, spaceAction } from './keys'
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

  // Keys from the prototype: Space play, V visualizer, Q queue, Escape closes.
  // Not while typing, and not with Ctrl, Alt or Meta held.
  function onkeydown(e: KeyboardEvent): void {
    const t = e.target as HTMLElement
    if (e.key === 'Escape' && menu.open) return menu.close()
    if (isTyping(t)) return
    if (e.key === 'Escape') {
      if (layout.settingsOpen) layout.settingsOpen = false
      else if (layout.showQueue) layout.showQueue = false
    }
    // Space never presses a focused button, with or without a modifier.
    const space = spaceAction(e, t, !!menu.open)
    if (space !== 'none') e.preventDefault()
    if (space === 'toggle') playing.togglePlay()
    if (e.ctrlKey || e.altKey || e.metaKey) return
    if (e.key === 'v') layout.cycleVisualizer()
    if (e.key === 'q') layout.toggleQueue()
  }
</script>

<!-- the last position goes to main before the window closes -->
<svelte:window {onkeydown} onpagehide={() => queue.savePos()} />

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
