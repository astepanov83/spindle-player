<script lang="ts">
  import { player } from '../stores/player.svelte'
  import { queue } from '../stores/queue.svelte'

  let el: HTMLDivElement
  const pct = $derived(
    (queue.current.duration ? (player.pos / queue.current.duration) * 100 : 0) + '%'
  )

  function seekTo(e: PointerEvent): void {
    const r = el.getBoundingClientRect()
    player.pos = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * queue.current.duration
  }

  function onpointerdown(e: PointerEvent): void {
    el.setPointerCapture(e.pointerId)
    seekTo(e)
  }

  function onpointermove(e: PointerEvent): void {
    if (el.hasPointerCapture(e.pointerId)) seekTo(e)
  }
</script>

<div class="seek" bind:this={el} {onpointerdown} {onpointermove} role="presentation">
  <div class="track">
    <div class="fill" style:width={pct}></div>
    <div class="knob" style:left={pct}></div>
  </div>
</div>

<style>
  .seek {
    height: 18px;
    display: flex;
    align-items: center;
    cursor: pointer;
    touch-action: none;
    flex: 1;
  }
  .track {
    flex: 1;
    height: 4px;
    border-radius: 2px;
    background: var(--active);
    position: relative;
  }
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--ink);
    border-radius: 2px;
  }
  .knob {
    position: absolute;
    top: 50%;
    width: 12px;
    height: 12px;
    margin: -6px 0 0 -6px;
    border-radius: 50%;
    background: var(--ink);
    opacity: 0;
    transition: opacity 0.15s;
  }
  .seek:hover .knob {
    opacity: 1;
  }
  .seek:hover .track {
    height: 6px;
  }
</style>
