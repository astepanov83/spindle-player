<script lang="ts">
  import { player } from '../stores/player.svelte'
  import { queues } from '../stores/queues.svelte'
  import { fmtTime } from '../format'
  import { sliderKey } from '../keys'

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
    queues.seek(at(e))
    drag = null
  }

  // A slider for the keyboard: arrows 5 s, Page Up and Down 30 s, Home and End.
  function onkeydown(e: KeyboardEvent): void {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !player.duration) return
    const to = sliderKey(e.key, player.pos, player.duration, 5, 30)
    if (to === null) return
    e.preventDefault()
    queues.seek(to)
  }
</script>

<div
  class="seek"
  bind:this={el}
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  onpointercancel={() => (drag = null)}
  {onkeydown}
  role="slider"
  tabindex="0"
  aria-label="Seek"
  aria-valuemin={0}
  aria-valuemax={Math.round(player.duration)}
  aria-valuenow={Math.round(shown)}
  aria-valuetext="{fmtTime(shown)} of {fmtTime(player.duration)}"
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
  .seek:hover .knob,
  .seek:focus-visible .knob {
    opacity: 1;
  }
  .seek:focus-visible {
    border-radius: 4px;
  }
  .seek:hover .track,
  .seek:focus-visible .track {
    height: 6px;
  }
</style>
