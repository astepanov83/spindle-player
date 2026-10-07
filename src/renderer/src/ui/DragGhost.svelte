<!-- What songs are on the move (ticket 089): a small card beside the pointer,
     with how many when more than one. It never takes the pointer, so what
     is under it can be found. -->
<script lang="ts">
  import Thumb from './Thumb.svelte'
  import { songDrag } from '../stores/song-drag.svelte'

  const W = 260
  const H = 56
  let winW = $state(0)
  let winH = $state(0)

  const d = $derived(songDrag.drag)
  // right of the pointer, or left of it near the window's right edge
  const left = $derived(d ? (d.x + 14 + W > winW ? d.x - 14 - W : d.x + 14) : 0)
  // under it, or over it near the bottom
  const top = $derived(d ? (d.y + 10 + H > winH ? d.y - 10 - H : d.y + 10) : 0)
</script>

<svelte:window bind:innerWidth={winW} bind:innerHeight={winH} />

{#if d}
  <div
    class="ghost"
    class:off={!songDrag.over}
    aria-hidden="true"
    style:transform="translate({Math.max(4, left)}px, {Math.max(4, top)}px)"
    style:width="{W}px"
  >
    <Thumb src={d.cover} size={36} radius={4} />
    <span class="words">
      <span class="nm">{d.title}</span>
      {#if d.sub}<span class="sub">{d.sub}</span>{/if}
    </span>
    {#if d.keys.length > 1}
      <span class="many">{d.keys.length.toLocaleString()} songs</span>
    {/if}
  </div>
{/if}

<style>
  .ghost {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px 8px 8px;
    border-radius: 10px;
    /* the panel over the ground, so rows don't show through */
    background: linear-gradient(var(--panel), var(--panel)), var(--bg);
    border: 1px solid var(--edge);
    box-shadow: 0 10px 28px var(--shadow);
    pointer-events: none;
    transition: opacity 0.12s;
  }
  /* over nothing that takes songs */
  .ghost.off {
    opacity: 0.75;
  }
  .words {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .nm,
  .sub {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .nm {
    font-size: var(--text-m);
  }
  .sub {
    font-size: var(--text-s);
    color: var(--ink-2);
  }
  /* how many songs go, as on the queue's own drag */
  .many {
    position: absolute;
    top: -8px;
    right: 8px;
    padding: 2px 8px;
    border-radius: 99px;
    background: var(--ink);
    color: var(--bg);
    font-size: var(--text-xs);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
</style>
