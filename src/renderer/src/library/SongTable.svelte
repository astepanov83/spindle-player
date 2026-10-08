<!-- Sortable song table. Only the rows on screen are drawn. Songs are item
     keys; each row shows what the song's plugin says (ticket 056), greyed
     while its plugin is off or its data is not in yet. -->
<script lang="ts">
  import { tick, type Snippet } from 'svelte'
  import type { ItemKey } from '../../../shared/plugins/items'
  import type { QueueLink } from '../../../shared/saved-queue'
  import Eq from '../ui/Eq.svelte'
  import ViewHead from './ViewHead.svelte'
  import Thumb from '../ui/Thumb.svelte'
  import { fmtCount, fmtTime } from '../format'
  import { virtualList } from '../ui/virtual-list.svelte'
  import { keepPlace } from '../ui/keep-place.svelte'
  import { roving } from '../ui/roving'
  import { nextSort, sortItems, type Sort, type SortKey } from './views'
  import { infoOf, itemInfo, itemsVersion } from '../plugins'
  import { library } from '../stores/library.svelte'
  import { queues } from '../stores/queues.svelte'
  import { queue } from '../stores/queue.svelte'
  import { openSongMenu } from './song-menu'
  import { dragSongs } from './drag-songs'
  import { isRemoveKey, rowAfterRemove } from '../keys'
  import { playlists } from '../stores/playlists.svelte'
  import { plays as playCounts } from '../stores/plays.svelte'
  import { lastPlayedText } from './plays'
  import { rowSelection } from '../stores/selection.svelte'
  import { listRows } from '../ui/selection'
  import { dropTarget, songDrag, type DragSongs, type DropTarget } from '../stores/song-drag.svelte'
  import { dropSlot, movedTo } from '../ui/drag-rows'
  import { moveOrder, shiftOrder } from '../queue/logic'

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
    count = true,
    artist = true,
    plays = false,
    onmove
  }: {
    title: string
    meta: string
    items: ItemKey[]
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
    // the Artist column; off where every song has the page's artist
    artist?: boolean
    // Plays and Last played columns (Classic's Songs, ticket 085)
    plays?: boolean
    // set while the rows show a playlist in its own order: a drag or
    // Alt+Up / Alt+Down gives the songs shown in their new order (ticket 089)
    onmove?: (keys: ItemKey[]) => void
  } = $props()

  const ROW = 54
  const allCols: [SortKey, string][] = [
    ['t', 'Title'],
    ['a', 'Artist'],
    ['al', 'Album'],
    ['p', 'Plays'],
    ['lp', 'Last played'],
    ['d', 'Time']
  ]
  const playCols: SortKey[] = ['p', 'lp']
  // a sort by a hidden column stays, as in a narrow table
  const cols = $derived(
    allCols.filter(([k]) => (artist || k !== 'a') && (plays || !playCols.includes(k)))
  )

  const sort = $derived(given === undefined ? library.sort : given)
  // ties keep the order given
  const rows = $derived(sortItems(items, sort, infoOf, (k) => playCounts.of(k)))
  // "today" for Last played: new with each play, not ticking past midnight
  const now = $derived.by(() => {
    void playCounts.all
    return Date.now()
  })
  let list: HTMLDivElement | undefined = $state()

  const v = virtualList(() => ({ count: rows.length, scrollEl, list, size: ROW }), 10)
  keepPlace(() => ({
    scrollEl,
    list,
    items: rows,
    per: 1,
    rowSize: ROW,
    key: (k: ItemKey) => k,
    source: itemsVersion()
  }))

  // Ctrl and Shift select rows by song, so a new sort keeps them (ticket 086)
  const shown = $derived(listRows(rows))
  const sel = rowSelection(
    () => shown,
    (keys) => keys
  )

  // Playing from the table makes the sorted list the queue. A greyed row
  // can't play.
  function play(i: number): void {
    if (itemInfo(rows[i]).state !== 'ok') return
    queue.playList(rows, i, title, link)
  }

  function onrowclick(e: MouseEvent, i: number): void {
    // the end of a drag that started on this row
    if (songDrag.tookClick()) return
    if (!sel.click(i, e)) play(i)
  }

  // the songs a key or a drag on row `i` acts on: the selected ones when it is one of them
  const keysFor = (i: number): ItemKey[] => (sel.has(rows[i]) ? sel.ids() : [rows[i]])

  // Delete in a playlist takes the row out of it, or every selected row when
  // it is one; focus goes to the row that takes the first one's place.
  // Alt+Up / Alt+Down move them one place, in a playlist in its own order.
  function onrowkey(e: KeyboardEvent, i: number): void {
    if (onmove && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      e.preventDefault()
      const at = keysFor(i).map((k) => shown.indexOf(k))
      const order = shiftOrder(rows.length, at, e.key === 'ArrowUp' ? -1 : 1)
      const to = order.indexOf(i)
      if (to === i) return
      onmove(order.map((k) => rows[k]))
      focusRow(to)
      return
    }
    if (!playlistId || !isRemoveKey(e)) return
    e.preventDefault()
    const keys = keysFor(i)
    const at = shown.indexOf(keys[0])
    playlists.removeItems(playlistId, keys)
    focusRow(rowAfterRemove(at, rows.length))
  }

  function focusRow(to: number | null): void {
    tick().then(() => {
      const row = to === null ? null : list?.querySelector<HTMLElement>(`[data-index="${to}"]`)
      row?.focus()
      row?.scrollIntoView({ block: 'nearest' })
    })
  }

  // Songs dragged from here (ticket 089) go to a playlist or the queue. In a
  // playlist in its own order they can also go to another place in it: the
  // rows make room where they would land.
  const self = {}
  const dragOf = (i: number): DragSongs =>
    dragSongs(keysFor(i), { from: title, link, source: self })

  // while own rows are over the table: them, in order, and the gap they go to
  type Moving = { rows: number[]; slot: number }
  let moving = $state<Moving | null>(null)
  const listY = (y: number): number => y - (list?.getBoundingClientRect().top ?? 0)
  function movingOf(d: DragSongs, y: number): Moving | null {
    const at = d.keys.map((k) => shown.indexOf(k))
    if (at.some((r) => r < 0)) return null
    return { rows: at.sort((a, b) => a - b), slot: dropSlot(listY(y), ROW, rows.length) }
  }
  const zone: DropTarget | undefined = $derived(
    onmove
      ? {
          takes: (d) => d.source === self,
          over: (d, _x, y) => (moving = movingOf(d, y)),
          leave: () => (moving = null),
          drop: (d, _x, y) => {
            const m = movingOf(d, y)
            if (m) onmove(moveOrder(rows.length, m.rows, m.slot).map((k) => rows[k]))
          },
          scroller: () => scrollEl
        }
      : undefined
  )
  const lifted = $derived(new Set(moving?.rows))
  // where row `i` would land: its number and place follow the drop place
  const placeOf = (i: number): number => (moving ? movedTo(i, moving.rows, moving.slot) : i)
  const topOf = (i: number, offset: number): number => (moving ? placeOf(i) * ROW : offset)
</script>

{#if !head && !meta}
  <!-- a list view's one-line title row, as Albums' (Classic's Songs) -->
  <ViewHead {title} count={count ? fmtCount(rows.length, 'song', 'songs') : ''} />
{:else}
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
      <div class="page-meta">{fmtCount(rows.length, 'song', 'songs')}</div>
    {/if}
  </div>
{/if}
<div class="tbl" class:noartist={!artist} class:plays>
  <!-- The rows are buttons in a list, not a table, so the heads are sort
       buttons, not column headers; each says how it sorts. -->
  <div class="th song-head" data-sticky-top role="group" aria-label="Sort songs">
    <span></span>
    {#each cols as [k, label] (k)}
      {@const on = sort?.k === k}
      <span class="h-{k}" class:end={k === 'd' || k === 'p' || k === 'lp'}>
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
    class="rows lines song-rows"
    class:moving={!!moving}
    bind:this={list}
    use:dropTarget={zone}
    style:height="{v.total}px"
    use:roving={{ rows, count: rows.length, scrollTo: (i) => v.scrollToIndex(i), select: sel }}
  >
    {#each v.items as item (item.key)}
      {@const key = rows[item.index]}
      {@const s = itemInfo(key)}
      {@const cur = queues.isItem(key)}
      <button
        class="tr row"
        class:cur-row={cur}
        class:dim={s.state !== 'ok'}
        class:selected={sel.has(key)}
        class:lifted={lifted.has(item.index)}
        data-row
        data-index={item.index}
        aria-current={cur ? 'true' : undefined}
        style:transform="translateY({topOf(item.index, v.offset(item))}px)"
        onpointerdown={(e) => songDrag.press(e, () => dragOf(item.index))}
        onclick={(e) => onrowclick(e, item.index)}
        onkeydown={(e) => onrowkey(e, item.index)}
        oncontextmenu={(e) =>
          openSongMenu(e, sel.menu(item.index), { inPlaylist: playlistId, from: title, link })}
      >
        <span class="n"
          >{#if cur && queues.songPlaying}<Eq />{:else}{placeOf(item.index) + 1}{/if}</span
        >
        {#if s.state === 'ok'}
          {@const t = s.info}
          {@const away = t.unavailable}
          <span class="tt">
            <Thumb src={t.art?.cover} art={t.art} size={36} radius={4} away={!!away} />
            <span class="words">
              <span class="nm" title={t.title}>{t.title}</span>
              <!-- shown only when a narrow table drops the Artist column; why
                   it can't play shows always when there is no such column -->
              {#if artist}<span class="sub" class:away title={away ?? t.subtitle}
                  >{away ?? t.subtitle ?? ''}</span
                >
              {:else if away}<span class="sub away shown" title={away}>{away}</span>{/if}
            </span>
          </span>
          {#if artist}<span class="o ar" class:away title={away ?? t.subtitle}
              >{away ?? t.subtitle ?? ''}</span
            >{/if}
          <span class="o al" title={t.group}>{t.group ?? ''}</span>
          {#if plays}
            {@const p = playCounts.of(key)}
            <span class="pl">{p ? p.n.toLocaleString() : ''}</span>
            <span class="lp">{p ? lastPlayedText(p.last, now) : ''}</span>
          {/if}
          <span class="d">{t.length === undefined ? '' : fmtTime(t.length)}</span>
        {:else}
          <span class="tt">
            <Thumb src={undefined} size={36} radius={4} />
            <span class="words"><span class="nm">{s.state === 'off' ? s.text : ''}</span></span>
          </span>
          {#if artist}<span class="o ar"></span>{/if}
          <span class="o al"></span>
          {#if plays}<span class="pl"></span><span class="lp"></span>{/if}
          <span class="d"></span>
        {/if}
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
  /* own rows dragged over the playlist: the others make room */
  .moving .tr {
    transition: transform 0.12s;
  }
  .moving .tr:hover {
    background: none;
  }
  .tr.lifted {
    visibility: hidden;
  }
  .tr > span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .n,
  .d,
  .pl,
  .lp {
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
  .sub.shown {
    display: block;
  }
  /* its music folder was not found: why it can't play */
  .away,
  .ar.away {
    color: var(--warn);
  }

  /* Classic's Songs: Plays and Last played before Time, dropped first when narrow */
  .plays .th,
  .plays .tr {
    --cols: 44px minmax(0, 2fr) minmax(0, 1.3fr) minmax(0, 1.3fr) 68px 112px 56px;
  }
  @container (max-width: 760px) {
    .plays .th,
    .plays .tr {
      --cols: 44px minmax(0, 2fr) minmax(0, 1.3fr) minmax(0, 1.3fr) 56px;
    }
    .pl,
    .lp,
    .h-p,
    .h-lp {
      display: none;
    }
  }

  /* A narrow table drops Album, then Artist, which moves under the title.
     Sorting by a dropped column stays; its header comes back when wider. */
  @container (max-width: 520px) {
    .th,
    .tr,
    .plays .th,
    .plays .tr {
      --cols: 44px minmax(0, 2fr) minmax(0, 1.3fr) 56px;
    }
    .al,
    .h-al {
      display: none;
    }
  }
  @container (max-width: 380px) {
    .th,
    .tr,
    .plays .th,
    .plays .tr {
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
  /* every song has the page's artist: the title and album get its room */
  .noartist .th,
  .noartist .tr {
    --cols: 44px minmax(0, 2fr) minmax(0, 1.3fr) 56px;
  }
  @container (max-width: 520px) {
    .noartist .th,
    .noartist .tr {
      --cols: 44px minmax(0, 1fr) 56px;
    }
  }
  .o {
    color: var(--ink-2);
  }
  .cur-row .nm {
    font-weight: 600;
  }
  /* its plugin is off, or its data is not in yet */
  .dim .nm {
    color: var(--ink-3);
  }
  .dim :global(.mini) {
    opacity: 0.5;
  }
</style>
