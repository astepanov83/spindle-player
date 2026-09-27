<script lang="ts">
  import { defaultPalette } from '../../shared/library'
  import TitleBar from './components/TitleBar.svelte'
  import Settings from './components/Settings.svelte'
  import Node from './layout/Node.svelte'
  import { startFakeClock } from './stores/fake-clock'
  import { layout } from './stores/layout.svelte'
  import { togglePlay, player } from './stores/player.svelte'
  import { queue } from './stores/queue.svelte'
  import { settings } from './stores/settings.svelte'

  const palette = $derived(queue.currentAlbum?.palette ?? defaultPalette)

  $effect(() => startFakeClock())

  // Every change goes to main, which saves it and applies the window size and theme.
  $effect(() => window.settingsApi.save($state.snapshot(settings)))

  // Keys from the prototype: Space play, V visualizer, Q queue, Escape closes.
  function onkeydown(e: KeyboardEvent): void {
    const t = e.target as HTMLElement
    if (/INPUT|TEXTAREA/.test(t.tagName)) return
    if (e.code === 'Space' && t.tagName !== 'BUTTON') {
      e.preventDefault()
      togglePlay()
    }
    if (e.key === 'v') layout.cycleVisualizer()
    if (e.key === 'q') layout.toggleQueue()
    if (e.key === 'Escape') {
      if (layout.settingsOpen) layout.settingsOpen = false
      else if (layout.showQueue) layout.showQueue = false
    }
  }
</script>

<svelte:window {onkeydown} />

<div
  class="app vz-{settings.visualizer}"
  class:playing={player.playing}
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
</div>

<style>
  .app {
    /* --c2 with lightness capped and chroma raised in light, so pale covers still show as a bar or highlight */
    --c2-mark: oklch(from var(--c2) min(l, var(--mark-l)) max(c, var(--mark-c)) h);
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
