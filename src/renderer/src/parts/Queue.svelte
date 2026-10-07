<script lang="ts">
  import { tick, untrack } from 'svelte'
  import GoLink from '../ui/GoLink.svelte'
  import IconButton from '../ui/IconButton.svelte'
  import Thumb from '../ui/Thumb.svelte'
  import LiveHistory from './LiveHistory.svelte'
  import { fmtLength, fmtTime } from '../format'
  import { virtualList } from '../ui/virtual-list.svelte'
  import { roving } from '../ui/roving'
  import { isRemoveKey, rowAfterRemove } from '../keys'
  import { dropIndex, dropSlot, rowShift } from '../ui/drag-rows'
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

  // header and close are set by the container, not by templates
  let { header = false, close = false }: { header?: boolean; close?: boolean } = $props()

  const ROW = 60
  let body: HTMLDivElement | undefined = $state()
  let list: HTMLDivElement | undefined = $state()

  const v = virtualList(() => ({ count: queue.items.length, scrollEl: body, list, size: ROW }))

  // Keep the current song in view when the track changes, not on other redraws
  // or when rows move around it.
  let seen = -1
  const currentKey = (): number => queue.starts
  $effect(() => {
    const key = currentKey()
    // a live item showed its songs here: back on the queue, show its current song again
    if (!body) {
      seen = -1
      return
    }
    if (key === seen) return
    seen = key
    // one row above the current song, as in the prototype; wait for the list to get its height
    const index = Math.max(0, untrack(() => queue.index) - 1)
    tick().then(() => v.scrollToIndex(index))
  })

  // A clicked row is already on screen, so leave the scroll where it is.
  function playRow(index: number): void {
    if (dragged) {
      dragged = false
      return
    }
    queue.jump(index)
    seen = currentKey()
  }

  // 50k songs: itemInfo is a lookup that makes no objects
  const total = $derived(queue.items.reduce((s, key) => s + lengthOf(key), 0))

  function lengthOf(key: ItemKey): number {
    const s = itemInfo(key)
    return s.state === 'ok' ? (s.info.length ?? 0) : 0
  }
  const sum = $derived(
    `${queue.items.length.toLocaleString()} ${queue.items.length === 1 ? 'song' : 'songs'}` +
      ` · ${fmtLength(total)}`
  )
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

  // Alt+Up / Alt+Down move the focused row; focus goes with it. Delete
  // takes it out; focus goes to the row that takes its place.
  function onrowkey(e: KeyboardEvent, i: number): void {
    if (isRemoveKey(e)) {
      e.preventDefault()
      queue.remove(i)
      focusRow(rowAfterRemove(i, queue.items.length))
      return
    }
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    const to = e.key === 'ArrowUp' ? i - 1 : i + 1
    if (to < 0 || to >= queue.items.length) return
    queue.move(i, to)
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
  // id: the song dragged, so a queue that changed meanwhile (a rescan) drops nothing
  type Drag = { from: number; id: string; y: number; grab: number }
  let drag = $state<Drag | null>(null)
  let press: { i: number; y: number; grab: number } | null = null
  // the click that ends a drag must not play the row
  let dragged = false
  let lastY = 0
  let scrollTimer = 0

  const slot = $derived(drag ? dropSlot(drag.y, ROW, queue.items.length) : -1)
  const shift = (i: number): number => (drag ? rowShift(i, drag.from, slot, ROW) : 0)

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
      drag = { from: press.i, id: queue.items[press.i], y, grab: press.grab }
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
    const { from, id } = drag
    const to = dropIndex(from, slot)
    clearInterval(scrollTimer)
    drag = null
    dragged = true
    // no click comes when the pointer left the row it pressed
    setTimeout(() => (dragged = false))
    if (queue.items[from] === id) queue.move(from, to)
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
        onclick={() => queue.clear()}>Clear</button
      >
    </div>
  {/if}
  {#if onLive}
    <LiveHistory />
  {:else}
    <div class="body" bind:this={body}>
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
          scrollTo: (i) => v.scrollToIndex(i)
        }}
      >
        {#each v.items as item (item.key)}
          {@const key = queue.items[item.index]}
          {@const s = itemInfo(key)}
          {@const cur = item.index === queue.index}
          <button
            class="qrow row"
            class:cur-row={cur}
            class:past={item.index < queue.index}
            class:dim={s.state !== 'ok'}
            class:lifted={drag?.from === item.index}
            data-row
            data-index={item.index}
            aria-current={cur ? 'true' : undefined}
            style:transform="translateY({v.offset(item) + shift(item.index)}px)"
            onclick={() => playRow(item.index)}
            onpointerdown={(e) => onrowdown(e, item.index)}
            onkeydown={(e) => onrowkey(e, item.index)}
            oncontextmenu={(e) => openSongMenu(e, [key], { queueRow: item.index })}
          >
            {@render words(s, cur && queues.songPlaying)}
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
    padding: 14px 10px 6px 20px;
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
    padding: 4px 8px 12px;
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
  .sum {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 0 16px 4px 20px;
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
