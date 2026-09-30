<!-- Slides in from the right over its host. Its toggle sits in the player.buttons slot. -->
<script lang="ts">
  import Queue from '../parts/Queue.svelte'
  import { layout } from '../stores/layout.svelte'

  let el: HTMLDivElement | undefined = $state()

  // Closing with focus inside makes it inert and drops the focus, so the
  // queue button in the slot takes it. .pre: before inert is set.
  $effect.pre(() => {
    if (layout.showQueue || !el?.contains(document.activeElement)) return
    queueMicrotask(() =>
      document.querySelector<HTMLElement>('[data-slot] [data-act="queue"]')?.focus()
    )
  })
</script>

<div class="drawer" bind:this={el} class:open={layout.showQueue} inert={!layout.showQueue}>
  <div class="part part-queue"><Queue header close /></div>
</div>

<style>
  .drawer {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(360px, 92%);
    z-index: 6;
    background: var(--panel);
    backdrop-filter: blur(20px);
    box-shadow: -24px 0 48px var(--shadow);
    border: 0 !important;
    border-left: 1px solid var(--edge) !important;
    transform: translateX(24px);
    opacity: 0;
    pointer-events: none;
    transition: 0.25s;
    display: flex;
    flex-direction: column;
  }
  .drawer.open {
    transform: none;
    opacity: 1;
    pointer-events: auto;
  }
  .part {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  @media (prefers-reduced-motion: reduce) {
    .drawer {
      transition: none;
    }
  }
</style>
