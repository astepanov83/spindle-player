<!--
  Where the visualizer draws: a canvas, plus the cover on the big stage.
  For now it draws the resting look when something changes. Ticket 008 adds
  the requestAnimationFrame loop that calls drawStage every frame.
-->
<script lang="ts">
  import { defaultPalettes } from '../../../shared/palette'
  import Cover from '../ui/Cover.svelte'
  import { layout } from '../stores/layout.svelte'
  import { queue } from '../stores/queue.svelte'
  import { settings } from '../stores/settings.svelte'
  import { theme } from '../stores/theme.svelte'
  import { barColors } from './colors'
  import { drawStage } from './draw'

  let { cover = true }: { cover?: boolean } = $props()

  const names = { ring: 'Ring', spectrum: 'Spectrum', wave: 'Wave', off: 'Visualizer off' }

  let stage: HTMLDivElement
  let size = $state(0)

  $effect(() => {
    const ro = new ResizeObserver(() => size++)
    ro.observe(stage)
    return () => {
      ro.disconnect()
    }
  })

  function redraw(): void {
    drawStage(
      stage,
      settings.visualizer,
      barColors(queue.currentAlbum?.palette ?? defaultPalettes, theme.light)
    )
  }

  $effect(() => {
    void size
    redraw()
  })
</script>

<div class="vstage" bind:this={stage}>
  <canvas></canvas>
  {#if cover}
    <!-- the cover changes size with the style, so draw again when it settles -->
    <div class="cover" ontransitionend={redraw}>
      <div class="img"><Cover src={queue.currentAlbum?.coverLarge} /></div>
    </div>
  {/if}
  <div class="vz-label" class:show={layout.vzLabel}>{names[settings.visualizer]}</div>
</div>

<style>
  .vstage {
    position: relative;
    min-height: 0;
    container-type: size;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }
  .cover {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 52cqmin;
    height: 52cqmin;
    transform: translate(-50%, -50%);
    border-radius: 10px;
    transition:
      width 0.45s cubic-bezier(0.3, 1.2, 0.5, 1),
      height 0.45s cubic-bezier(0.3, 1.2, 0.5, 1),
      border-radius 0.45s,
      top 0.45s;
    box-shadow:
      0 0 0 calc(var(--bass) * 9px) color-mix(in srgb, var(--c2) 22%, transparent),
      0 22px calc(40px + var(--bass) * 40px) -12px color-mix(in srgb, var(--c2) 55%, var(--shadow));
  }
  .img {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    overflow: hidden;
  }
  :global(.vz-ring) .cover {
    border-radius: 50%;
  }
  :global(.vz-spectrum) .cover {
    width: 56cqmin;
    height: 56cqmin;
    top: 40%;
  }
  :global(.vz-wave) .cover {
    width: 60cqmin;
    height: 60cqmin;
  }
  :global(.vz-off) .cover {
    width: 78cqmin;
    height: 78cqmin;
  }
  :global(.vz-ring) .img {
    animation: spin 40s linear infinite;
    animation-play-state: paused;
  }
  :global(.playing.vz-ring) .img {
    animation-play-state: running;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .vz-label {
    position: absolute;
    left: 50%;
    top: 8px;
    transform: translateX(-50%);
    font-size: 12px;
    font-weight: 600;
    padding: 5px 11px;
    border-radius: 99px;
    background: var(--glass);
    backdrop-filter: blur(8px);
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
    z-index: 2;
    white-space: nowrap;
  }
  .vz-label.show {
    opacity: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .img {
      animation: none !important;
    }
    .cover {
      transition: none;
    }
  }
</style>
