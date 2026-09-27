<script lang="ts">
  import { createVirtualizer } from '@tanstack/svelte-virtual'
  import { tick, untrack } from 'svelte'
  import IconButton from '../ui/IconButton.svelte'
  import Thumb from '../ui/Thumb.svelte'
  import { fmtTime } from '../format'
  import { layout } from '../stores/layout.svelte'
  import { library } from '../stores/library.svelte'
  import { player } from '../stores/player.svelte'
  import { queue } from '../stores/queue.svelte'

  // header and close are set by the container, not by templates
  let { header = false, close = false }: { header?: boolean; close?: boolean } = $props()

  const ROW = 60
  let body: HTMLDivElement | undefined = $state()
  let list: HTMLDivElement | undefined = $state()

  const v = createVirtualizer<HTMLDivElement, HTMLButtonElement>({
    count: 0,
    getScrollElement: () => body ?? null,
    estimateSize: () => ROW,
    overscan: 8
  })

  $effect(() => {
    const count = queue.items.length
    const margin = list?.offsetTop ?? 0
    untrack(() =>
      $v.setOptions({ count, scrollMargin: margin, getScrollElement: () => body ?? null })
    )
  })

  // Keep the current song in view when the track changes, not on other redraws.
  let seen = ''
  $effect(() => {
    const key = queue.index + ':' + queue.current.id
    if (key === seen || !body) return
    seen = key
    const top = Math.max(0, (queue.index - 1) * ROW)
    // wait for the list to get its height
    tick().then(() => body && (body.scrollTop = top))
  })
</script>

<div class="qpart">
  {#if header}
    <div class="head">
      <div><b>Queue</b><small>From {queue.from}</small></div>
      {#if close}
        <IconButton icon="close" label="Close queue" onclick={() => (layout.showQueue = false)} />
      {/if}
    </div>
  {/if}
  <div class="body" bind:this={body}>
    <div class="rows" bind:this={list} style:height="{$v.getTotalSize()}px">
      {#each $v.getVirtualItems() as item (item.key)}
        {@const id = queue.items[item.index]}
        {@const t = library.track(id)}
        {@const cur = item.index === queue.index}
        <button
          class="qrow"
          class:cur-row={cur}
          class:cur
          class:past={item.index < queue.index}
          style:transform="translateY({item.start - $v.options.scrollMargin}px)"
          onclick={() => queue.jump(item.index)}
        >
          <Thumb src={library.album(t.albumId).cover} eq={cur && player.playing} />
          <span class="qt"><span class="nm">{t.title}</span><span class="ar">{t.artist}</span></span
          >
          <span class="d">{fmtTime(t.duration)}</span>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .qpart {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 10px 6px 20px;
    flex: none;
  }
  b {
    display: block;
    font-size: 15px;
  }
  small {
    font-size: 12px;
    color: var(--ink-3);
  }
  .body {
    flex: 1;
    overflow: auto;
    padding: 4px 8px 12px;
    min-height: 0;
    position: relative;
  }
  .rows {
    position: relative;
  }
  .qrow {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 60px;
    display: grid;
    grid-template-columns: 44px 1fr auto;
    gap: 14px;
    align-items: center;
    text-align: left;
    padding: 8px 12px;
    border-radius: 10px;
  }
  .qrow:hover {
    background: var(--hover);
  }
  /* the current song, tinted with the album accent */
  .qrow.cur-row {
    background: color-mix(in srgb, var(--c2-mark) 26%, var(--hover));
    box-shadow: inset 3px 0 0 var(--c2-mark);
  }
  .qt {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .nm {
    font-size: 15px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ar {
    font-size: 13px;
    color: var(--ink-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .d {
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
    font-size: 13px;
  }
  .cur .nm {
    font-weight: 600;
    color: var(--ink);
  }
  .past {
    opacity: 0.45;
  }
  .past:hover {
    opacity: 0.8;
  }
</style>
