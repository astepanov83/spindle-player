<script lang="ts">
  import { player, seek } from '../stores/player.svelte'

  let el: HTMLDivElement
  // while dragging, the knob follows the mouse and the song jumps on release
  let drag: number | null = $state(null)
  const shown = $derived(drag ?? player.pos)
  const pct = $derived((player.duration ? Math.min(100, (shown / player.duration) * 100) : 0) + '%')

  function at(e: PointerEvent): number {
    const r = el.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * player.duration
  }

  function onpointerdown(e: PointerEvent): void {
    if (!player.duration) return
    el.setPointerCapture(e.pointerId)
    drag = at(e)
  }

  function onpointermove(e: PointerEvent): void {
    if (drag !== null && el.hasPointerCapture(e.pointerId)) drag = at(e)
  }

  function onpointerup(e: PointerEvent): void {
    if (drag === null) return
    seek(at(e))
    drag = null
  }
</script>

<div
  class="seek"
  bind:this={el}
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  onpointercancel={() => (drag = null)}
  role="presentation"
>
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
