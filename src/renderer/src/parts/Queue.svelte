<script lang="ts">
  import { tick, untrack } from 'svelte'
  import GoLink from '../ui/GoLink.svelte'
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
  import { ROW, clearLabel, followsSong, insertSlotAt, startRow } from '../queue/rows'
  import { dropSlot, movedTo } from '../ui/drag-rows'
  import { layout } from '../stores/layout.svelte'
  import { library } from '../stores/library.svelte'
  import { queues } from '../stores/queues.svelte'
  import { playlists } from '../stores/playlists.svelte'
  import { queue } from '../stores/queue.svelte'
  import { openSongMenu } from '../library/song-menu'
  import { linkTarget } from '../../../shared/saved-queue'
  import type { ItemKey } from '../../../shared/plugins/items'
  import type { ItemAnswer } from '../plugins/types'
  import { canOpen, infoOf, itemInfo, openPage } from '../plugins'
  import { dropTarget, type DropTarget } from '../stores/song-drag.svelte'

  // header and close are set by the container, not by templates
  let { header = false, close = false }: { header?: boolean; close?: boolean } = $props()

  let body: HTMLDivElement | undefined = $state()
  let list: HTMLDivElement | undefined = $state()

  // Played songs stay in the list, dimmed, so a song starting never moves rows.
  const v = virtualList(() => ({ count: queue.items.length, scrollEl: body, list, size: ROW }))

  // Ctrl and Shift select rows (ticket 086), by number: a song can be in the
  // queue twice.
  const shownRows = $derived(numberRows(queue.items.length))
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

  // When a song ends and the next starts, it goes near the top, unless the
  // user scrolled the queue in the last few seconds. A clicked row stays where
  // it is: it is on screen already. Not on other redraws, or when rows move.
  let seen = -1
  let clicked = false
  let scrolledAt = -Infinity
  // our own scrolls are not the user's
  let scrollingAt = -Infinity
  $effect(() => {
    const key = queue.starts
    // a live item showed its songs here: back on the queue, show its current song again
    if (!body) {
      seen = -1
      return
    }
    if (key === seen) return
    const first = seen < 0
    seen = key
    const was = clicked
    clicked = false
    if (!first && (was || !followsSong(performance.now(), scrolledAt))) return
    const index = startRow(untrack(() => queue.index))
    const box = body
    // wait for the list to get its height
    tick().then(() =>
      onceSized(box, () => {
        scrollingAt = performance.now()
        v.scrollToIndex(index)
      })
    )
  })

  // A queue tab just opened has no height yet, and a scroll then is lost.
  function onceSized(el: HTMLElement, fn: () => void): void {
    if (el.clientHeight) return fn()
    const watch = new ResizeObserver(() => {
      if (!el.clientHeight) return
      watch.disconnect()
      fn()
    })
    watch.observe(el)
  }

  function onscroll(): void {
    const now = performance.now()
    if (now - scrollingAt > 500) scrolledAt = now
  }

  function onrowclick(e: MouseEvent, i: number): void {
    if (dragged) {
      dragged = false
      return
    }
    if (!sel.click(i, e)) playRow(i)
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

  // as if dropped where it is: the rows between make room
  const slot = $derived(drag ? dropSlot(drag.y, ROW, queue.items.length) : 0)
  const lifted = $derived(new Set(drag?.rows))

  function listY(clientY: number): number {
    return clientY - (list?.getBoundingClientRect().top ?? 0)
  }

  function onrowdown(e: PointerEvent, i: number): void {
    if (e.button !== 0) return
    const y = listY(e.clientY)
    press = { i, y, grab: y - i * ROW }
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
    const to = slot
    clearInterval(scrollTimer)
    drag = null
    dragged = true
    // no click comes when the pointer left the row it pressed
    setTimeout(() => (dragged = false))
    if (rows.every((r, k) => queue.items[r] === ids[k])) {
      reorderRows(moveOrder(queue.items.length, rows, to), rows)
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

  // Songs dragged in from the library (ticket 089) go in where the line
  // shows: after the current song at the earliest.
  let dropAt = $state<number | null>(null)
  const slotAt = (y: number): number => insertSlotAt(listY(y), queue.items.length, queue.index)
  const intoQueue: DropTarget = {
    over: (_d, _x, y) => (dropAt = slotAt(y)),
    leave: () => (dropAt = null),
    drop: (d, _x, y) => queue.insert(d.keys, slotAt(y), d.from, d.link),
    scroller: () => body
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
{#snippet words(s: ItemAnswer, eq: boolean)}
  {#if s.state === 'ok'}
    <Thumb src={s.info.art?.cover} {eq} />
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
        onclick={() => queue.clear()}>{clearLabel(queue.items.length, queue.index)}</button
      >
    </div>
  {/if}
  {#if onLive}
    <LiveHistory />
  {:else}
    <div class="body" bind:this={body} {onscroll} use:dropTarget={intoQueue}>
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
          scrollTo: (i) => v.scrollToIndex(i),
          select: {
            step: (a, b) => sel.step(a, b),
            all: () => sel.all(),
            clear: () => sel.clear()
          }
        }}
      >
        {#each v.items as item (item.key)}
          {@const i = item.index}
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
            style:transform="translateY({drag
              ? movedTo(i, drag.rows, slot) * ROW
              : v.offset(item)}px)"
            onclick={(e) => onrowclick(e, i)}
            onpointerdown={(e) => onrowdown(e, i)}
            onkeydown={(e) => onrowkey(e, i)}
            oncontextmenu={(e) => {
              const rows = sel.menu(i)
              openSongMenu(
                e,
                rows.map((r) => queue.items[r]),
                { queueRows: rows }
              )
            }}
          >
            {@render words(s, cur && queues.songPlaying)}
          </button>
        {/each}
        {#if dropAt !== null}
          <div
            class="dropline"
            aria-hidden="true"
            style:transform="translateY({dropAt * ROW}px)"
          ></div>
        {/if}
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
  .dragging .qrow {
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
  /* where songs dragged in from the library go */
  .dropline {
    position: absolute;
    top: -1px;
    left: 8px;
    right: 8px;
    height: 2px;
    border-radius: 1px;
    background: var(--focus);
    z-index: 2;
    pointer-events: none;
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
