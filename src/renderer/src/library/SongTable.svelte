<!-- Sortable song table. Only the rows on screen are drawn. -->
<script lang="ts">
  import type { Track } from '../../../shared/library'
  import Eq from '../ui/Eq.svelte'
  import Thumb from '../ui/Thumb.svelte'
  import { fmtTime } from '../format'
  import { virtualList } from '../ui/virtual-list.svelte'
  import { nextSort, sortRows, type SortKey } from './views'
  import { library } from '../stores/library.svelte'
  import { player } from '../stores/player.svelte'
  import { queue } from '../stores/queue.svelte'

  let {
    title,
    meta,
    items,
    scrollEl
  }: { title: string; meta: string; items: Track[]; scrollEl: HTMLElement | undefined } = $props()

  const ROW = 54
  const cols: [SortKey, string][] = [
    ['t', 'Title'],
    ['a', 'Artist'],
    ['al', 'Album'],
    ['d', 'Time']
  ]

  const rows = $derived(sortRows(items, library.sort, (t) => library.order(t)))
  let list: HTMLDivElement | undefined = $state()

  const v = virtualList(() => ({ count: rows.length, scrollEl, list, size: ROW }), 10)

  // playing from the table makes the sorted list the queue
  function play(i: number): void {
    queue.playList(
      rows.map((t) => t.id),
      i,
      title
    )
  }
</script>

<div class="tblhead">
  <div>
    <div class="m">{meta}</div>
    <h2>{title}</h2>
  </div>
  <div class="m">{rows.length} songs</div>
</div>
<div class="tbl">
  <div class="th">
    <span></span>
    {#each cols as [k, label] (k)}
      {@const on = library.sort.k === k}
      <span
        role="columnheader"
        class:end={k === 'd'}
        aria-sort={on ? (library.sort.dir > 0 ? 'ascending' : 'descending') : undefined}
      >
        <button class:on onclick={() => (library.sort = nextSort(library.sort, k))}
          >{label}{on ? (library.sort.dir > 0 ? ' ↑' : ' ↓') : ''}</button
        >
      </span>
    {/each}
  </div>
  <div class="rows" bind:this={list} style:height="{v.total}px">
    {#each v.items as item (item.key)}
      {@const t = rows[item.index]}
      {@const cur = queue.isCurrent(t.id)}
      <button
        class="tr"
        class:cur-row={cur}
        class:cur
        class:first={item.index === 0}
        style:transform="translateY({v.offset(item)}px)"
        onclick={() => play(item.index)}
      >
        <span class="n"
          >{#if cur && player.playing}<Eq />{:else}{item.index + 1}{/if}</span
        >
        <span class="tt">
          <Thumb src={library.album(t.albumId).cover} size={36} radius={4} />
          <span class="nm">{t.title}</span>
        </span>
        <span class="o">{t.artist}</span>
        <span class="o">{t.album}</span>
        <span class="d">{fmtTime(t.duration)}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .tblhead {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 16px;
  }
  h2 {
    font-family: var(--display);
    font-size: 32px;
    margin: 4px 0 8px;
    letter-spacing: -0.02em;
    line-height: 1.05;
    text-wrap: balance;
  }
  .m {
    color: var(--ink-3);
    font-size: 13px;
  }
  .tbl {
    /* 44px, not 36: row numbers reach five digits in a big library */
    --cols: 44px minmax(0, 2fr) minmax(0, 1.3fr) minmax(0, 1.3fr) 56px;
  }
  .th,
  .tr {
    display: grid;
    grid-template-columns: var(--cols);
    gap: 16px;
    align-items: center;
    padding: 0 12px;
  }
  /* the scroll box has 20px top padding */
  .th {
    position: sticky;
    top: -20px;
    background: var(--bg);
    z-index: 1;
    height: 38px;
    border-bottom: 1px solid var(--edge);
  }
  .th button {
    font-size: 12px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-3);
    text-align: left;
    font-weight: 600;
  }
  .th button:hover,
  .th button.on {
    color: var(--ink);
  }
  .th .end {
    text-align: right;
  }
  .rows {
    position: relative;
  }
  .tr {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 54px;
    text-align: left;
    font-size: 14.5px;
    border-radius: 8px;
    box-shadow: 0 -1px 0 var(--edge);
  }
  .tr.first {
    box-shadow: none;
  }
  .tr:hover {
    background: var(--hover);
  }
  .tr.cur-row {
    background: color-mix(in srgb, var(--c2) 26%, var(--hover));
    box-shadow: inset 3px 0 0 var(--c2);
  }
  .tr > span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .n,
  .d {
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
    font-size: 14px;
    text-align: right;
  }
  .n {
    display: flex;
    justify-content: flex-end;
  }
  .tt {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--ink);
  }
  .nm {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .o {
    color: var(--ink-2);
  }
  .cur .tt {
    font-weight: 600;
  }
</style>
