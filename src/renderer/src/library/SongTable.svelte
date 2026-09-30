<!-- Sortable song table. Only the rows on screen are drawn. -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { Track } from '../../../shared/library'
  import type { QueueLink } from '../../../shared/saved-queue'
  import Eq from '../ui/Eq.svelte'
  import Thumb from '../ui/Thumb.svelte'
  import { fmtTime } from '../format'
  import { virtualList } from '../ui/virtual-list.svelte'
  import { keepPlace } from '../ui/keep-place.svelte'
  import { roving } from '../ui/roving'
  import { nextSort, sortRows, type Sort, type SortKey } from './views'
  import { library } from '../stores/library.svelte'
  import { playing } from '../stores/playing.svelte'
  import { queue } from '../stores/queue.svelte'
  import { openSongMenu } from './song-menu'

  let {
    title,
    meta,
    items,
    scrollEl,
    sort: given,
    onsort = (k) => (library.sort = nextSort(library.sort, k)),
    playlistId,
    link,
    head,
    count = true
  }: {
    title: string
    meta: string
    items: Track[]
    scrollEl: HTMLElement | undefined
    // the library's sort unless given; a playlist has its own
    sort?: Sort | null
    onsort?: (k: SortKey) => void
    // set in a playlist, so the menu can take songs out of it
    playlistId?: string
    // what "From" opens after playing from here
    link?: QueueLink
    // replaces the title block (a playlist's name can be edited)
    head?: Snippet
    // the song count on the right; off where the page's header says it already
    count?: boolean
  } = $props()

  const ROW = 54
  const cols: [SortKey, string][] = [
    ['t', 'Title'],
    ['a', 'Artist'],
    ['al', 'Album'],
    ['d', 'Time']
  ]

  const sort = $derived(given === undefined ? library.sort : given)
  const rows = $derived(sortRows(items, sort, (t) => library.order(t)))
  let list: HTMLDivElement | undefined = $state()

  const v = virtualList(() => ({ count: rows.length, scrollEl, list, size: ROW }), 10)
  keepPlace(() => ({
    scrollEl,
    list,
    items: rows,
    per: 1,
    rowSize: ROW,
    key: (t: Track) => t.id,
    source: library.revision
  }))

  // playing from the table makes the sorted list the queue
  function play(i: number): void {
    queue.playList(
      rows.map((t) => t.id),
      i,
      title,
      link
    )
  }
</script>

<div class="tblhead">
  {#if head}
    {@render head()}
  {:else}
    <div>
      <div class="page-meta">{meta}</div>
      <h2 class="page-title">{title}</h2>
    </div>
  {/if}
  {#if count}
    <div class="page-meta">{rows.length} {rows.length === 1 ? 'song' : 'songs'}</div>
  {/if}
</div>
<div class="tbl">
  <!-- The rows are buttons in a list, not a table, so the heads are sort
       buttons, not column headers; each says how it sorts. -->
  <div class="th" role="group" aria-label="Sort songs">
    <span></span>
    {#each cols as [k, label] (k)}
      {@const on = sort?.k === k}
      <span class="h-{k}" class:end={k === 'd'}>
        <button
          class:on
          aria-pressed={on}
          aria-label="{label}{on ? (sort?.dir === 1 ? ', ascending' : ', descending') : ''}"
          onclick={() => onsort(k)}>{label}{on ? (sort?.dir === 1 ? ' ↑' : ' ↓') : ''}</button
        >
      </span>
    {/each}
  </div>
  <div
    class="rows lines"
    bind:this={list}
    style:height="{v.total}px"
    use:roving={{ rows, count: rows.length, scrollTo: (i) => v.scrollToIndex(i) }}
  >
    {#each v.items as item (item.key)}
      {@const t = rows[item.index]}
      {@const cur = playing.isSong(t.id)}
      <button
        class="tr row"
        class:cur-row={cur}
        data-row
        data-index={item.index}
        aria-current={cur ? 'true' : undefined}
        style:transform="translateY({v.offset(item)}px)"
        onclick={() => play(item.index)}
        oncontextmenu={(e) =>
          openSongMenu(e, [t.id], { inPlaylist: playlistId, from: title, link })}
      >
        <span class="n"
          >{#if cur && playing.songPlaying}<Eq />{:else}{item.index + 1}{/if}</span
        >
        <span class="tt">
          <Thumb src={library.art(t).cover} size={36} radius={4} />
          <span class="words">
            <span class="nm" title={t.title}>{t.title}</span>
            <!-- shown only when the Artist column is gone -->
            <span class="sub" title={t.artist}>{t.artist}</span>
          </span>
        </span>
        <span class="o ar" title={t.artist}>{t.artist}</span>
        <span class="o al" title={t.album}>{t.album}</span>
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
  .tbl {
    container-type: inline-size;
  }
  .th,
  .tr {
    /* 44px, not 36: row numbers reach five digits in a big library */
    --cols: 44px minmax(0, 2fr) minmax(0, 1.3fr) minmax(0, 1.3fr) 56px;
    display: grid;
    grid-template-columns: var(--cols);
    gap: 16px;
    align-items: center;
    padding: 0 12px;
  }
  /* sticks to the top of the scroll box, over its top padding */
  .th {
    position: sticky;
    top: calc(-1 * var(--scroll-pad-top, 20px));
    background: var(--bg);
    z-index: 1;
    height: 38px;
    border-bottom: 1px solid var(--edge);
  }
  .th button {
    font-size: var(--text-xs);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-3);
    text-align: left;
    font-weight: 600;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
    font-size: var(--text-l);
  }
  /* Up keeps the focused row clear of the sticky head */
  .tr {
    scroll-margin-top: calc(38px + var(--scroll-pad-top, 20px));
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
    font-size: var(--text-m);
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
  .words {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .nm,
  .sub {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sub {
    display: none;
    color: var(--ink-2);
    font-size: var(--text-s);
    margin-top: 2px;
  }

  /* A narrow table drops Album, then Artist, which moves under the title.
     Sorting by a dropped column stays; its header comes back when wider. */
  @container (max-width: 520px) {
    .th,
    .tr {
      --cols: 44px minmax(0, 2fr) minmax(0, 1.3fr) 56px;
    }
    .al,
    .h-al {
      display: none;
    }
  }
  @container (max-width: 380px) {
    .th,
    .tr {
      --cols: 44px minmax(0, 1fr) 56px;
      gap: 12px;
    }
    .ar,
    .h-a {
      display: none;
    }
    .sub {
      display: block;
    }
  }
  .o {
    color: var(--ink-2);
  }
  .cur-row .nm {
    font-weight: 600;
  }
</style>
