<!-- A rows block (Folders, MFP's episodes): a row each, only the rows on
     screen drawn. A row is made only when it is drawn. -->
<script lang="ts">
  import { openSongMenu } from '../library/song-menu'
  import Eq from '../ui/Eq.svelte'
  import Icon from '../ui/Icon.svelte'
  import Thumb from '../ui/Thumb.svelte'
  import { keepPlace } from '../ui/keep-place.svelte'
  import { virtualList } from '../ui/virtual-list.svelte'
  import { itemsVersion, openFrom } from '../plugins'
  import type { Row, RowsBlock } from '../plugins/types'
  import { player } from '../stores/player.svelte'
  import { queues } from '../stores/queues.svelte'

  let {
    block: b,
    tab,
    scrollEl
  }: { block: RowsBlock; tab: string; scrollEl: HTMLElement | undefined } = $props()

  const ROW = 56
  const items = $derived(b.items as unknown[])

  let list: HTMLDivElement | undefined = $state()
  const v = virtualList(() => ({ count: items.length, scrollEl, list, size: ROW }), 6)
  keepPlace(() => ({
    scrollEl,
    list,
    items,
    per: 1,
    rowSize: ROW,
    key: (x: unknown) => b.key(x),
    source: itemsVersion()
  }))

  // not while radio plays
  const playing = (r: Row): boolean => !!queues.item && !!r.playing?.(queues.item)
</script>

<div class="rows lines" bind:this={list} style:height="{v.total}px">
  {#each v.items as item (item.key)}
    {@const r = b.row(items[item.index])}
    {@const more = r.details ?? []}
    <button
      class="row"
      style:grid-template-columns={more.length
        ? `40px minmax(0, 1fr) repeat(${more.length}, auto) 5.5em 16px`
        : undefined}
      style:transform="translateY({v.offset(item)}px)"
      onclick={() => openFrom(tab, r.to, b.filtered)}
      oncontextmenu={(e) => openSongMenu(e, r.songs(), { from: r.from, link: r.link })}
    >
      <Thumb src={r.art} size={40} radius={6} />
      <span class="nm">
        <span class="t"
          >{#if playing(r)}<Eq paused={!player.playing} />{/if}<span title={r.title}>{r.title}</span
          ></span
        >
        {#if r.subtitle}<span class="where" title={r.subtitle}>{r.subtitle}</span>{/if}
      </span>
      {#each more as d, i (i)}<span class="n">{d}</span>{/each}
      <span class="n" class:end={more.length > 0}>{r.meta ?? ''}</span>
      <span class="go"><Icon name="back" size={16} /></span>
    </button>
  {/each}
</div>

<style>
  .rows {
    position: relative;
  }
  .row {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 56px;
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto 16px;
    gap: 14px;
    align-items: center;
    padding: 0 12px;
    font-size: var(--text-l);
  }
  .nm {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .t {
    display: flex;
    gap: 6px;
    align-items: center;
    min-width: 0;
  }
  .t span,
  .where {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .where {
    font-size: var(--text-s);
    color: var(--ink-3);
  }
  .n {
    color: var(--ink-3);
    font-size: var(--text-s);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  /* with more columns, the last one lines up from row to row */
  .end {
    text-align: right;
  }
  /* the back arrow turned around */
  .go {
    display: grid;
    color: var(--ink-3);
    transform: scaleX(-1);
  }
</style>
