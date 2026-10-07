<script module lang="ts">
  // Open or folded in every queue part (tab, drawer, column), until closed again.
  const played = $state({ open: false })
</script>

<script lang="ts">
  import { tick, untrack } from 'svelte'
  import GoLink from '../ui/GoLink.svelte'
  import Icon from '../ui/Icon.svelte'
  import IconButton from '../ui/IconButton.svelte'
  import Thumb from '../ui/Thumb.svelte'
  import LiveHistory from './LiveHistory.svelte'
  import { fmtCount, fmtLength, fmtTime } from '../format'
  import { virtualList } from '../ui/virtual-list.svelte'
  import { roving } from '../ui/roving'
  import { isRemoveKey, rowAfterRemove } from '../keys'
  import { moveOrder, shiftOrder } from '../queue/logic'
  import { movedSelection, noneSelected, numberRows } from '../ui/selection'
  import { rowSelection } from '../stores/selection.svelte'
  import {
    clearLabel,
    dragTops,
    dropSlotAt,
    firstShown,
    followsSong,
    keepTop,
    lineAt,
    lineCount,
    lineOf,
    lineSize,
    lineTop,
    showsCover,
    startLine,
    type Shape
  } from '../queue/up-next'
  import { layout } from '../stores/layout.svelte'
  import { library } from '../stores/library.svelte'
  import { player } from '../stores/player.svelte'
  import { queues } from '../stores/queues.svelte'
  import { playlists } from '../stores/playlists.svelte'
  import { queue } from '../stores/queue.svelte'
  import { openSongMenu } from '../library/song-menu'
  import { linkTarget } from '../../../shared/saved-queue'
  import type { ItemKey } from '../../../shared/plugins/items'
  import type { ItemAnswer } from '../plugins/types'
  import { canOpen, infoOf, itemInfo, openPage } from '../plugins'

  // header and close are set by the container, not by templates
  let { header = false, close = false }: { header?: boolean; close?: boolean } = $props()

  let body: HTMLDivElement | undefined = $state()
  let list: HTMLDivElement | undefined = $state()

  // Played songs (folded or not), Now playing, Up next: one virtual list of
  // lines, where the headings are lines too.
  const shape: Shape = $derived({
    count: queue.items.length,
    current: queue.index,
    open: played.open
  })
  const first = $derived(firstShown(shape))
  // a new function when the lines change, so the list measures them again
  const sizeOf = $derived.by(() => {
    const s = shape
    return (i: number) => lineSize(i, s)
  })
  const v = virtualList(() => ({ count: lineCount(shape), scrollEl: body, list, size: sizeOf }))

  // Ctrl and Shift select rows (ticket 086), by number: a song can be in the
  // queue twice. Only rows shown can be selected.
  const shownRows = $derived(numberRows(first, queue.items.length))
  const sel = rowSelection(
    () => shownRows,
    (rows) => rows.map((r) => queue.items[r])
  )
  // A move (here, from the menu, by drag) keeps the selected rows on the
  // same songs at their new places. Any other change (a song added, a
  // rescan) puts other songs at those numbers: the selection goes.
  let listSeen = queue.items
  $effect(() => {
    const items = queue.items
    untrack(() => {
      const was = listSeen
      listSeen = items
      if (items === was) return
      const m = queue.lastOrder
      if (m && m.before === was && m.after === items) sel.set(movedSelection(sel.s, m.order))
      else sel.set(noneSelected())
    })
  })

  function reorderRows(order: number[], moved: number[]): void {
    if (!order.every((k, j) => k === j)) queue.reorder(order, moved)
  }

  // the songs drawn; the headings are drawn apart, so a drag can move them
  const drawn = $derived(
    v.items.flatMap((item) => {
      const line = lineAt(item.index, shape)
      return line.kind === 'row' ? [{ index: line.index, top: v.offset(item) }] : []
    })
  )
  const rowTop = (i: number): number => lineTop(lineOf(i, shape) ?? 0, shape)

  // When a song starts, Now playing goes to the top, unless the user scrolled
  // the queue in the last few seconds: then the songs on screen stay put.
  // Not on other redraws, or when rows move around the current song.
  let seen = -1
  let before: Shape | undefined
  // a clicked row moves up to Now playing, so it is followed always
  let clicked = false
  let scrolledAt = -Infinity
  // our own scrolls are not the user's
  let scrollingAt = -Infinity
  $effect(() => {
    const key = queue.starts
    const s = shape
    const was = before
    before = s
    // a live item showed its songs here: back on the queue, show its current song again
    if (!body) {
      seen = -1
      return
    }
    if (key === seen) return
    seen = key
    const follow = !was || clicked || followsSong(performance.now(), scrolledAt)
    clicked = false
    // wait for the list to get its height
    tick().then(() => {
      if (!body || !list) return
      scrollingAt = performance.now()
      if (follow) v.scrollToIndex(startLine(s))
      else body.scrollTop = keepTop(body.scrollTop - list.offsetTop, was, s) + list.offsetTop
    })
  })

  function onscroll(): void {
    const now = performance.now()
    if (now - scrollingAt > 500) scrolledAt = now
  }

  function togglePlayed(): void {
    played.open = !played.open
    // looking at the played songs: a new song does not scroll them away
    scrolledAt = performance.now()
  }

  function onrowclick(e: MouseEvent, i: number): void {
    if (dragged) {
      dragged = false
      return
    }
    if (!sel.click(i - first, e)) playRow(i)
  }

  function playRow(index: number): void {
    const was = queue.starts
    queue.jump(index)
    clicked = queue.starts !== was
  }

  // 50k songs: itemInfo is a lookup that makes no objects
  const total = $derived(queue.items.reduce((s, key) => s + lengthOf(key), 0))

  function lengthOf(key: ItemKey): number {
    const s = itemInfo(key)
    return s.state === 'ok' ? (s.info.length ?? 0) : 0
  }
  const sum = $derived(`${fmtCount(queue.items.length, 'song', 'songs')} · ${fmtLength(total)}`)

  // Up next: the count and the time to the end of the queue. Shuffle never
  // gets there, so it shows only how long those songs are.
  const after = $derived.by(() => {
    let sec = 0
    for (let i = queue.index + 1; i < queue.items.length; i++) sec += lengthOf(queue.items[i])
    return sec
  })
  const nextMeta = $derived.by(() => {
    const n = fmtCount(Math.max(0, queue.items.length - queue.index - 1), 'song', 'songs')
    if (player.shuffle) return `${n} · ${fmtLength(after)}`
    const cur = queue.current ? lengthOf(queue.current) : 0
    return `${n} · ${fmtLength(after + Math.max(0, cur - player.pos))} left`
  })
  // where the headings stand, apart from during a drag
  const nowLine = $derived((lineOf(queue.index, shape) ?? 1) - 1)
  const hasNext = $derived(queue.index < queue.items.length - 1)
  // "From" opens a playlist, or the plugin's page (an album, artist, folder),
  // while it is still there
  const openFrom = $derived.by(() => {
    const link = queue.link
    if (!link) return undefined
    let show: () => void
    if (link.plugin === 'core') {
      const to = linkTarget(link)
      if (to?.kind !== 'playlist' || !playlists.get(to.id)) return undefined
      show = () => library.showPlaylist(to.id)
    } else {
      const to = { plugin: link.plugin, page: link.page }
      if (!canOpen(to)) return undefined
      show = () => openPage(to)
    }
    return () => {
      // the drawer would cover the page opened
      layout.showQueue = false
      show()
    }
  })

  // the rows a key on row `i` acts on: the selected ones when it is one of them
  const rowsFor = (i: number): number[] => (sel.has(i) ? sel.ids() : [i])

  // Alt+Up / Alt+Down move the focused row, or the selected rows with it;
  // focus goes with it. Delete takes them out; focus goes to the row that
  // takes the first one's place.
  function onrowkey(e: KeyboardEvent, i: number): void {
    if (isRemoveKey(e)) {
      e.preventDefault()
      const rows = rowsFor(i)
      queue.removeRows(rows)
      focusRow(rowAfterRemove(rows[0], queue.items.length))
      return
    }
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    const rows = rowsFor(i)
    const order = shiftOrder(queue.items.length, rows, e.key === 'ArrowUp' ? -1 : 1)
    const to = order.indexOf(i)
    if (to === i) return
    reorderRows(order, rows)
    // moved up past the current song: show the played ones, so focus and
    // the selection can follow
    if (rows.some((r) => order.indexOf(r) < queue.index)) played.open = true
    focusRow(to)
  }

  function focusRow(i: number | null): void {
    if (i === null) return
    tick().then(() => {
      const row = list?.querySelector<HTMLElement>(`[data-index="${i}"]`)
      row?.focus()
      row?.scrollIntoView({ block: 'nearest' })
    })
  }

  // Drag to reorder. The row follows the pointer as a copy drawn over the list
  // (the row itself can leave the drawn rows while the list scrolls); the rows
  // between make room where it would land.
  // from: the row pressed; rows: it, or the selected rows it is one of.
  // ids: their songs, so a queue that changed meanwhile (a rescan) drops nothing.
  type Drag = { from: number; rows: number[]; ids: string[]; y: number; grab: number }
  let drag = $state<Drag | null>(null)
  let press: { i: number; y: number; grab: number } | null = null
  // the click that ends a drag must not play the row
  let dragged = false
  let lastY = 0
  let scrollTimer = 0

  // as if dropped where it is: the rows between make room, Now playing and
  // Up next move to where they will be
  const tops = $derived.by(() => {
    if (!drag) return undefined
    return dragTops(shape, drag.rows, dropSlotAt(drag.y, shape))
  })
  const lifted = $derived(new Set(drag?.rows))

  function listY(clientY: number): number {
    return clientY - (list?.getBoundingClientRect().top ?? 0)
  }

  function onrowdown(e: PointerEvent, i: number): void {
    if (e.button !== 0) return
    const y = listY(e.clientY)
    press = { i, y, grab: y - rowTop(i) }
  }

  function onpointermove(e: PointerEvent): void {
    lastY = e.clientY
    if (!press) return
    const y = listY(e.clientY)
    if (!drag) {
      if (Math.abs(y - press.y) < 5) return
      const rows = rowsFor(press.i)
      drag = { from: press.i, rows, ids: rows.map((r) => queue.items[r]), y, grab: press.grab }
      scrollTimer = window.setInterval(edgeScroll, 16)
    }
    drag.y = y
  }

  // near the top or bottom of the list, it scrolls, faster closer to the edge
  function edgeScroll(): void {
    if (!drag || !body) return
    const r = body.getBoundingClientRect()
    const edge = 48
    const up = lastY - r.top
    const down = r.bottom - lastY
    const step = up < edge ? -(edge - up) / 3 : down < edge ? (edge - down) / 3 : 0
    if (!step) return
    body.scrollTop += step
    drag.y = listY(lastY)
  }

  function onpointerup(): void {
    press = null
    if (!drag) return
    const { rows, ids } = drag
    const slot = dropSlotAt(drag.y, shape)
    clearInterval(scrollTimer)
    drag = null
    dragged = true
    // no click comes when the pointer left the row it pressed
    setTimeout(() => (dragged = false))
    if (rows.every((r, k) => queue.items[r] === ids[k])) {
      reorderRows(moveOrder(queue.items.length, rows, slot), rows)
    }
  }

  // Escape stops a drag only: in capture, so App's Escape (which closes the drawer) never sees it
  function onescape(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || !drag) return
    e.stopPropagation()
    e.preventDefault()
    oncancel()
  }

  function oncancel(): void {
    press = null
    clearInterval(scrollTimer)
    drag = null
  }

  // A live item: its recent songs in place of the queue, with a head even in a tab.
  const onLive = $derived(queues.active === 'live')
  const liveHead = $derived(
    `${infoOf(queues.live.current ?? undefined)?.title ?? ''} · recent songs`
  )

  // in the markup this would lose its spaces next to a block
  const dot = ' · '
</script>

<!-- A song its plugin can't give now is greyed: off says so, loading says
     nothing yet. -->
{#snippet words(s: ItemAnswer, eq: boolean, cover = true)}
  {#if s.state === 'ok'}
    {#if cover}<Thumb src={s.info.art?.cover} {eq} />{:else}<span class="no">{s.info.no}</span>{/if}
    <span class="qt"
      ><span class="nm" title={s.info.title}>{s.info.title}</span><span
        class="ar"
        title={s.info.subtitle}>{s.info.subtitle ?? ''}</span
      ></span
    >
    <span class="d">{s.info.length === undefined ? '' : fmtTime(s.info.length)}</span>
  {:else}
    <Thumb src={undefined} />
    <span class="qt"><span class="nm">{s.state === 'off' ? s.text : ''}</span></span>
    <span class="d"></span>
  {/if}
{/snippet}

<svelte:window
  {onpointermove}
  {onpointerup}
  onpointercancel={oncancel}
  onblur={oncancel}
  onkeydowncapture={onescape}
/>

<div class="qpart" class:dragging={!!drag}>
  {#if header || onLive}
    <div class="head">
      <div class="title">
        {#if onLive}
          <b title={liveHead}>{liveHead}</b>
        {:else}
          <b>Queue</b>{#if queue.from}<small>From <GoLink go={openFrom}>{queue.from}</GoLink></small
            >{/if}
        {/if}
      </div>
      {#if close}
        <IconButton icon="close" label="Close queue" onclick={() => (layout.showQueue = false)} />
      {/if}
    </div>
  {/if}
  {#if !onLive && queue.items.length}
    <div class="sum" class:tab={!header}>
      <!-- the tab has no head, so "From" goes here there -->
      <span class="count"
        >{#if !header && queue.from}From <GoLink go={openFrom}>{queue.from}</GoLink
          >{dot}{/if}{sum}</span
      >
      <button
        class="clear chip"
        title={queue.items.length > 1 ? 'Keep only the song playing' : 'Empty the queue'}
        onclick={() => queue.clear()}>{clearLabel(shape)}</button
      >
    </div>
  {/if}
  {#if onLive}
    <LiveHistory />
  {:else}
    <div class="body" bind:this={body} {onscroll}>
      {#if !queue.items.length}
        <p class="empty">
          The queue is empty. Songs you play{layout.hasLibrary ? '' : ' in Studio or Classic'} show up
          here.
        </p>
      {/if}
      <div
        class="rows"
        bind:this={list}
        style:height="{v.total}px"
        use:roving={{
          rows: queue.items,
          count: queue.items.length,
          first,
          scrollTo: (i) => v.scrollToIndex(lineOf(i, shape) ?? 0),
          select: {
            step: (a, b) => sel.step(a - first, b - first),
            all: () => sel.all(),
            clear: () => sel.clear()
          }
        }}
      >
        {#if queue.index > 0}
          <button class="qline fold" aria-expanded={played.open} onclick={togglePlayed}>
            <span class="chev" class:open={played.open}><Icon name="forward" size={16} /></span>
            <span class="section-label">Played ({queue.index.toLocaleString()})</span>
          </button>
        {/if}
        {#if queue.items.length}
          <div class="qline" style:transform="translateY({tops?.now ?? lineTop(nowLine, shape)}px)">
            <span class="section-label">Now playing</span>
          </div>
        {/if}
        {#if hasNext && (!tops || tops.next !== undefined)}
          <div
            class="qline"
            style:transform="translateY({tops?.next ?? lineTop(nowLine + 2, shape)}px)"
          >
            <span class="section-label">Up next</span><span class="meta">{nextMeta}</span>
          </div>
        {/if}
        {#each drawn as row (row.index)}
          {@const i = row.index}
          {@const key = queue.items[i]}
          {@const s = itemInfo(key)}
          {@const cur = i === queue.index}
          <button
            class="qrow row"
            class:cur-row={cur}
            class:past={i < queue.index}
            class:dim={s.state !== 'ok'}
            class:selected={sel.has(i)}
            class:lifted={lifted.has(i)}
            data-row
            data-index={i}
            aria-current={cur ? 'true' : undefined}
            style:transform="translateY({tops?.row(i) ?? row.top}px)"
            onclick={(e) => onrowclick(e, i)}
            onpointerdown={(e) => onrowdown(e, i)}
            onkeydown={(e) => onrowkey(e, i)}
            oncontextmenu={(e) => {
              const rows = sel.menu(i - first)
              openSongMenu(
                e,
                rows.map((r) => queue.items[r]),
                { queueRows: rows }
              )
            }}
          >
            {@render words(
              s,
              cur && queues.songPlaying,
              showsCover(s, i > first ? itemInfo(queue.items[i - 1]) : undefined, cur)
            )}
          </button>
        {/each}
        {#if drag}
          <div
            class="qrow ghost"
            class:cur-row={drag.from === queue.index}
            class:dim={itemInfo(queue.items[drag.from]).state !== 'ok'}
            aria-hidden="true"
            style:transform="translateY({drag.y - drag.grab}px)"
          >
            {@render words(itemInfo(queue.items[drag.from]), false)}
            {#if drag.rows.length > 1}
              <span class="many">{drag.rows.length.toLocaleString()} songs</span>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}
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
    padding: 14px max(10px, (100% - var(--content-max, 100%)) / 2 - 10px) 6px
      max(20px, (100% - var(--content-max, 100%)) / 2);
    flex: none;
  }
  .title {
    min-width: 0;
  }
  b {
    display: block;
    font-size: var(--text-l);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  small {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .body {
    flex: 1;
    overflow: auto;
    /* rows line up with --content-max (a wide Focus); the 12px is their own padding */
    padding: 4px max(8px, (100% - var(--content-max, 100%)) / 2 - 12px) 12px;
    min-height: 0;
    position: relative;
  }
  .rows {
    position: relative;
  }
  .empty {
    margin: 12px;
    font-size: var(--text-s);
    line-height: 1.5;
    color: var(--ink-3);
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
    padding: 8px 12px;
  }
  .dragging .qrow,
  .dragging .qline {
    transition: transform 0.12s;
    cursor: grabbing;
  }
  .dragging .qrow:not(.cur-row):hover {
    background: none;
  }
  .qrow.lifted {
    visibility: hidden;
  }
  .qrow.ghost,
  .dragging .qrow.ghost {
    transition: none;
    z-index: 2;
    background: var(--panel);
    box-shadow: 0 10px 28px var(--shadow);
    pointer-events: none;
  }
  /* the playing song lifted: its tint on a solid ground, so rows don't show through */
  .qrow.ghost.cur-row {
    background: color-mix(in srgb, var(--c2) 26%, var(--panel));
    box-shadow:
      inset 3px 0 0 var(--c2),
      0 10px 28px var(--shadow);
  }
  /* how many rows the drag takes along */
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
  /* the headings: Played (N), Now playing, Up next */
  .qline {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 32px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px 0;
    min-width: 0;
    white-space: nowrap;
  }
  .qline .meta {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: var(--text-xs);
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }
  .fold {
    gap: 4px;
    padding-left: 8px;
    color: var(--ink-3);
    border-radius: 6px;
    text-align: left;
  }
  .fold:hover,
  .fold:hover .section-label {
    color: var(--ink);
  }
  .chev {
    transition: transform 0.12s;
  }
  .chev.open {
    transform: rotate(90deg);
  }
  /* a track number in the cover's place, when the row above has the same cover */
  .no {
    width: 44px;
    text-align: center;
    color: var(--ink-3);
    font-size: var(--text-s);
    font-variant-numeric: tabular-nums;
  }
  .sum {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 0 max(16px, (100% - var(--content-max, 100%)) / 2) 4px
      max(20px, (100% - var(--content-max, 100%)) / 2);
    font-size: var(--text-xs);
    color: var(--ink-3);
    flex: none;
  }
  .sum.tab {
    padding-top: 10px;
  }
  .count {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-variant-numeric: tabular-nums;
  }
  /* a small chip, to fit the line */
  .clear {
    flex: none;
    padding: 4px 10px;
    font-size: var(--text-xs);
    font-weight: 600;
  }
  .qt {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .nm {
    font-size: var(--text-l);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ar {
    font-size: var(--text-s);
    color: var(--ink-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .d {
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
    font-size: var(--text-s);
  }
  .cur-row .nm {
    font-weight: 600;
    color: var(--ink);
  }
  .past {
    opacity: var(--past);
  }
  /* its plugin is off, or its data is not in yet */
  .dim .nm {
    color: var(--ink-3);
  }
  .dim :global(.mini) {
    opacity: 0.5;
  }
  /* a played row with focus shows its mark at full strength */
  .past:hover {
    opacity: 0.8;
  }
  .past:focus-visible {
    opacity: 1;
  }
</style>
