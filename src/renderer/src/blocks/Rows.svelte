<!-- A rows block: a row each, only the rows on screen drawn. A row is made
     only when it is drawn. Page rows (Folders, MFP's episodes) open their
     page; item rows (stations) play their item, with a star and a menu, and
     in a block that says so can be dragged to another place. -->
<script lang="ts">
  import { tick } from 'svelte'
  import type { PluginId } from '../../../shared/plugins'
  import { openSongMenu } from '../library/song-menu'
  import Eq from '../ui/Eq.svelte'
  import Icon from '../ui/Icon.svelte'
  import Thumb from '../ui/Thumb.svelte'
  import { dropIndex, dropSlot, edgeStep, rowShift } from '../ui/drag-rows'
  import { keepPlace } from '../ui/keep-place.svelte'
  import { roving } from '../ui/roving'
  import { virtualList } from '../ui/virtual-list.svelte'
  import { actOnPage, itemsVersion, openFrom } from '../plugins'
  import type { ItemRow, PageRow, Row, RowsBlock } from '../plugins/types'
  import { menu } from '../stores/menu.svelte'
  import { player } from '../stores/player.svelte'
  import { queues } from '../stores/queues.svelte'

  let {
    block: b,
    tab,
    plugin,
    scrollEl
  }: {
    block: RowsBlock
    tab: string
    plugin: PluginId
    scrollEl: HTMLElement | undefined
  } = $props()

  const items = $derived(b.items as unknown[])
  // item rows are taller, for the logo
  const plays = $derived(b.rows === 'item' && items.length > 0)
  const size = $derived(plays ? 60 : 56)

  let list: HTMLDivElement | undefined = $state()
  const v = virtualList(() => ({ count: items.length, scrollEl, list, size }), 6)
  keepPlace(() => ({
    scrollEl,
    list,
    items,
    per: 1,
    rowSize: size,
    key: (x: unknown) => b.key(x),
    source: itemsVersion()
  }))

  // a page row: one of its songs plays (not while radio plays)
  const playing = (r: PageRow): boolean => !!queues.item && !!r.playing?.(queues.item)
  // an item row: its item is the one picked, live or in the queue
  const current = $derived(queues.active === 'live' ? queues.live.current : queues.item)
  const liveState = $derived(queues.active === 'live' ? queues.live.status?.state : undefined)
  // bars while sound comes out; a dot while a live item connects or recovers
  const sounds = $derived(queues.active === 'live' ? liveState === 'live' : queues.songPlaying)
  const busy = $derived(!!liveState && liveState !== 'live')

  const isItem = (r: Row): r is ItemRow => 'play' in r

  // the row whose menu is open: its "..." stays shown meanwhile
  let menuKey = $state<string | null>(null)
  $effect(() => {
    if (!menu.open) menuKey = null
  })

  // a right click at the pointer, the "..." button's click under it
  function openMenu(e: MouseEvent, key: string, r: ItemRow): void {
    if (!r.menu?.length) return
    menu.showFor(
      e,
      r.menu.map((m) => ({ label: m.label, run: () => actOnPage(plugin, key, m.id) }))
    )
    menuKey = key
  }

  // The list is one Tab stop (ui/roving.ts); Right and Left step through a
  // row's buttons: the row, its star, its "...".
  function onrowkey(e: KeyboardEvent & { currentTarget: HTMLElement }): void {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const line = e.currentTarget.closest('[data-line]')
    const all = [...(line?.querySelectorAll<HTMLElement>('button') ?? [])]
    const at = all.indexOf(e.currentTarget) + (e.key === 'ArrowRight' ? 1 : -1)
    all[at]?.focus()
  }

  // Reordering: a drag or Alt+Up / Alt+Down tells the plugin which row's
  // place the row takes. Only for a block that says so, of two rows or more.
  const reorder = $derived(b.rows === 'item' && !!b.reorder && items.length > 1)

  // the row moved with the keyboard keeps the focus once the list has changed
  let focusKey: string | null = null
  $effect(() => {
    // read first, so the effect hears every new list
    const now = items
    const at = focusKey === null ? -1 : now.findIndex((x) => b.key(x) === focusKey)
    if (at < 0) return
    focusKey = null
    tick().then(() => {
      const row = list?.querySelector<HTMLElement>(`[data-index="${at}"]`)
      row?.focus({ preventScroll: true })
      row?.scrollIntoView({ block: 'nearest' })
    })
  })

  function moveTo(from: number, to: number): void {
    const key = b.key(items[from])
    const there = items[to]
    if (to === from || there === undefined) return
    actOnPage(plugin, key, 'move', b.key(there))
  }

  function onmainkey(e: KeyboardEvent & { currentTarget: HTMLElement }, i: number): void {
    if (reorder && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      e.preventDefault()
      const to = e.key === 'ArrowUp' ? i - 1 : i + 1
      if (to < 0 || to >= items.length) return
      focusKey = b.key(items[i])
      moveTo(i, to)
      return
    }
    onrowkey(e)
  }

  // Drag, as in the queue: a copy of the row follows the pointer over the
  // list, and the rows between make room where it would land.
  // key: the row dragged, so a list that changed meanwhile moves nothing
  type Drag = { from: number; key: string; y: number; grab: number }
  let drag = $state<Drag | null>(null)
  let press: { i: number; y: number; grab: number } | null = null
  // the click that ends a drag must not play the row
  let dragged = false
  let lastY = 0
  let scrollTimer = 0

  const slot = $derived(drag ? dropSlot(drag.y, size, items.length) : -1)
  const shift = (i: number): number => (drag ? rowShift(i, drag.from, slot, size) : 0)

  function listY(clientY: number): number {
    return clientY - (list?.getBoundingClientRect().top ?? 0)
  }

  function onrowdown(e: PointerEvent, i: number): void {
    if (!reorder || e.button !== 0) return
    const y = listY(e.clientY)
    press = { i, y, grab: y - i * size }
  }

  function onpointermove(e: PointerEvent): void {
    lastY = e.clientY
    if (!press) return
    const y = listY(e.clientY)
    if (!drag) {
      if (Math.abs(y - press.y) < 5) return
      drag = { from: press.i, key: b.key(items[press.i]), y, grab: press.grab }
      scrollTimer = window.setInterval(edgeScroll, 16)
    }
    drag.y = y
  }

  function edgeScroll(): void {
    if (!drag || !scrollEl) return
    const r = scrollEl.getBoundingClientRect()
    const step = edgeStep(lastY, r.top, r.bottom)
    if (!step) return
    scrollEl.scrollTop += step
    drag.y = listY(lastY)
  }

  function onpointerup(): void {
    press = null
    if (!drag) return
    const { from, key } = drag
    const to = dropIndex(from, slot)
    clearInterval(scrollTimer)
    drag = null
    dragged = true
    // no click comes when the pointer left the row it pressed
    setTimeout(() => (dragged = false))
    if (items[from] !== undefined && b.key(items[from]) === key) moveTo(from, to)
  }

  // Escape stops a drag only: in capture, so App's Escape never sees it
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

  function play(r: ItemRow): void {
    if (dragged) {
      dragged = false
      return
    }
    void queues.playItem(r.play)
  }

  const colsOf = (r: Row): string | undefined => {
    const more = r.details ?? []
    return more.length
      ? `${plays ? 44 : 40}px minmax(0, 1fr) repeat(${more.length}, auto) 5.5em${plays ? '' : ' 16px'}`
      : undefined
  }
</script>

<svelte:window
  onpointermove={reorder ? onpointermove : undefined}
  onpointerup={reorder ? onpointerup : undefined}
  onpointercancel={reorder ? oncancel : undefined}
  onblur={reorder ? oncancel : undefined}
  onkeydowncapture={reorder ? onescape : undefined}
/>

<!-- What an item row shows, in the row and in the copy that follows a drag. -->
{#snippet look(r: ItemRow, cur: boolean)}
  <Thumb src={r.art} art={r.made} size={44} radius={6} eq={cur && sounds} busy={cur && busy} />
  <span class="nm">
    <span class="t"><span>{r.title}</span></span>
    {#if r.subtitle}<span class="where" title={r.subtitle}>{r.subtitle}</span>{/if}
  </span>
  {#each r.details ?? [] as d, i (i)}<span class="n">{d}</span>{/each}
  <span class="n" class:end={(r.details ?? []).length > 0}>{r.meta ?? ''}</span>
{/snippet}

<div
  class="rows lines"
  class:stale={b.stale}
  class:dragging={!!drag}
  role={plays ? 'list' : undefined}
  bind:this={list}
  style:height="{v.total}px"
  use:roving={{ rows: items, count: items.length, scrollTo: (i) => v.scrollToIndex(i) }}
>
  {#each v.items as item (item.key)}
    {@const x = items[item.index]}
    {@const r = b.row(x)}
    {@const more = r.details ?? []}
    {@const cols = colsOf(r)}
    {#if isItem(r)}
      {@const key = b.key(x)}
      {@const cur = current === r.play}
      <div
        class="row line"
        class:cur-row={cur}
        class:lifted={drag?.from === item.index}
        role="listitem"
        data-line
        style:transform="translateY({v.offset(item) + shift(item.index)}px)"
        oncontextmenu={r.menu?.length ? (e) => openMenu(e, key, r) : undefined}
      >
        <button
          class="main"
          class:cur
          style:grid-template-columns={cols}
          title={r.title}
          data-row
          data-index={item.index}
          aria-current={cur ? 'true' : undefined}
          onkeydown={(e) => onmainkey(e, item.index)}
          onpointerdown={(e) => onrowdown(e, item.index)}
          onclick={() => play(r)}
        >
          {@render look(r, cur)}
        </button>
        {#if r.star}
          {@const s = r.star}
          <button
            class="star"
            class:on={s.on}
            tabindex="-1"
            onkeydown={onrowkey}
            aria-pressed={s.on}
            title={s.label}
            onclick={() => actOnPage(plugin, key, 'star')}
            ><Icon name={s.on ? 'starOn' : 'star'} size={20} /></button
          >
        {/if}
        <!-- a row with no menu keeps the room, so the columns line up from list to list -->
        {#if r.menu?.length}
          <button
            class="more"
            class:open={menuKey === key}
            tabindex="-1"
            aria-haspopup="menu"
            aria-label="More for {r.title}"
            title="More"
            onkeydown={onrowkey}
            onclick={(e) => openMenu(e, key, r)}><Icon name="more" size={20} /></button
          >
        {:else}
          <span class="more" aria-hidden="true"></span>
        {/if}
      </div>
    {:else}
      <button
        class="row page"
        style:grid-template-columns={cols}
        style:transform="translateY({v.offset(item)}px)"
        data-row
        data-index={item.index}
        onclick={() => openFrom(tab, r.to, b.filtered)}
        oncontextmenu={(e) => openSongMenu(e, r.songs(), { from: r.from, link: r.link })}
      >
        <Thumb src={r.art} art={r.made} size={40} radius={6} />
        <span class="nm">
          <span class="t"
            >{#if playing(r)}<Eq paused={!player.playing} />{/if}<span title={r.title}
              >{r.title}</span
            ></span
          >
          {#if r.subtitle}<span class="where" title={r.subtitle}>{r.subtitle}</span>{/if}
        </span>
        {#each more as d, i (i)}<span class="n">{d}</span>{/each}
        <span class="n" class:end={more.length > 0}>{r.meta ?? ''}</span>
        <span class="go"><Icon name="back" size={16} /></span>
      </button>
    {/if}
  {/each}
  {#if drag}
    {@const x = items[drag.from]}
    {@const r = x === undefined ? undefined : b.row(x)}
    {#if r && isItem(r)}
      {@const cur = current === r.play}
      <div
        class="row line ghost"
        class:cur-row={cur}
        aria-hidden="true"
        style:transform="translateY({drag.y - drag.grab}px)"
      >
        <div class="main" class:cur style:grid-template-columns={colsOf(r)}>
          {@render look(r, cur)}
        </div>
        {#if r.star}
          <span class="star" class:on={r.star.on}
            ><Icon name={r.star.on ? 'starOn' : 'star'} size={20} /></span
          >
        {/if}
        <span class="more"></span>
      </div>
    {/if}
  {/if}
</div>

<style>
  .rows {
    position: relative;
  }
  .stale {
    opacity: 0.6;
  }
  .row {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
  }
  .page {
    height: 56px;
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto 16px;
    gap: 14px;
    align-items: center;
    padding: 0 12px;
    font-size: var(--text-l);
  }
  .line {
    height: 60px;
    display: flex;
    align-items: center;
  }
  .main {
    flex: 1;
    min-width: 0;
    align-self: stretch;
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) auto;
    gap: 14px;
    align-items: center;
    text-align: left;
    padding: 0 4px 0 12px;
    font-size: var(--text-l);
  }
  .cur .t {
    font-weight: 600;
  }
  .star,
  .more {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    color: var(--ink-3);
    flex: none;
  }
  .more {
    margin-right: 6px;
    opacity: 0;
  }
  /* shown on the row under the pointer or with focus, and while its menu is open */
  .line:hover .more,
  .line:focus-within .more,
  .more.open {
    opacity: 1;
  }
  .star:hover,
  .more:hover,
  .more.open {
    background: var(--hover);
    color: var(--ink);
  }
  .dragging .line {
    transition: transform 0.12s;
    cursor: grabbing;
  }
  .dragging .line:not(.cur-row):hover {
    background: none;
  }
  .dragging .line:hover .more {
    opacity: 0;
  }
  .line.lifted {
    visibility: hidden;
  }
  .line.ghost,
  .dragging .line.ghost {
    transition: none;
    z-index: 2;
    background: var(--panel);
    box-shadow: 0 10px 28px var(--shadow);
    pointer-events: none;
  }
  /* the playing station lifted: its tint on a solid ground, so rows don't show through */
  .line.ghost.cur-row {
    background: color-mix(in srgb, var(--c2) 26%, var(--panel));
    box-shadow:
      inset 3px 0 0 var(--c2),
      0 10px 28px var(--shadow);
  }
  .star.on {
    color: var(--c2);
  }
  .nm {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .main .nm {
    gap: 2px;
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
