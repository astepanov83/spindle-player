<!--
  Where the visualizer draws: a canvas, plus the cover on the big stage.
  The frame loop (loop.ts) does the drawing; this tells it the stage is there,
  its size, and when the cover moved.
-->
<script lang="ts">
  import Cover from '../ui/Cover.svelte'
  import { layout } from '../stores/layout.svelte'
  import { queues } from '../stores/queues.svelte'
  import { settings } from '../stores/settings.svelte'
  import { addStage } from './loop'
  import { vzLabel, vzNames } from './names'

  // onclick: the bar's small stage changes the style, like the button beside it
  let { cover = true, onclick }: { cover?: boolean; onclick?: () => void } = $props()

  let stage: HTMLDivElement
  let canvas: HTMLCanvasElement
  let coverEl: HTMLDivElement | undefined = $state()
  let handle: ReturnType<typeof addStage> | undefined

  $effect(() => {
    const h = addStage(stage, canvas, cover ? (coverEl ?? null) : null)
    handle = h
    // Also fires with a zero size when a tab hides the stage, and again when it
    // shows. Device pixels, where the browser gives them, so the canvas is sharp.
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const dev = e.devicePixelContentBoxSize?.[0]
        const { width, height } = e.contentRect
        if (dev) h.resized(width, height, dev.inlineSize, dev.blockSize)
        else h.resized(width, height)
      }
    })
    try {
      ro.observe(canvas, { box: 'device-pixel-content-box' })
    } catch {
      ro.observe(canvas)
    }
    return () => {
      ro.disconnect()
      h.remove()
      handle = undefined
    }
  })
</script>

<!-- The bar's small stage has no cover to say what it is. Its click is for
     the mouse only: the button beside it does the same from the keyboard. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="vstage"
  class:click={!!onclick}
  bind:this={stage}
  title={cover ? undefined : `${vzLabel(settings.visualizer)}. Click to change.`}
  {onclick}
>
  <canvas bind:this={canvas}></canvas>
  {#if cover}
    <!-- the cover changes size with the style, so draw again when it settles -->
    <div class="cover" bind:this={coverEl} ontransitionend={() => handle?.moved()}>
      <div class="img"><Cover src={queues.art?.coverLarge} /></div>
    </div>
  {/if}
  <div class="vz-label" class:show={layout.vzLabel}>
    {settings.visualizer === 'off' ? vzLabel('off') : vzNames[settings.visualizer]}
  </div>
</div>

<style>
  .vstage {
    position: relative;
    min-height: 0;
    container-type: size;
  }
  .click {
    cursor: pointer;
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
      0 0 0 calc(var(--bass) * 9px) color-mix(in srgb, var(--c2) var(--glow), transparent),
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
    font-size: var(--text-xs);
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
