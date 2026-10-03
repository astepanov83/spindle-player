<!-- A rows block: a row each, only the rows on screen drawn. A row is made
     only when it is drawn. Page rows (Folders, MFP's episodes) open their
     page; item rows (stations) play their item, with a star and a menu. -->
<script lang="ts">
  import type { PluginId } from '../../../shared/plugins'
  import { openSongMenu } from '../library/song-menu'
  import Eq from '../ui/Eq.svelte'
  import Icon from '../ui/Icon.svelte'
  import Thumb from '../ui/Thumb.svelte'
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
  // all rows of a block are of one sort; item rows are taller, for the logo
  const plays = $derived(items.length > 0 && 'play' in b.row(items[0]))
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

  function openMenu(e: MouseEvent, key: string, r: ItemRow): void {
    if (!r.menu?.length) return
    menu.showFor(
      e,
      r.menu.map((m) => ({ label: m.label, run: () => actOnPage(plugin, key, m.id) }))
    )
  }

  // The list is one Tab stop (ui/roving.ts); Right reaches a row's star, Left goes back.
  function onrowkey(e: KeyboardEvent & { currentTarget: HTMLElement }, to: 'star' | 'main'): void {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (e.key !== (to === 'star' ? 'ArrowRight' : 'ArrowLeft')) return
    e.preventDefault()
    e.currentTarget.closest('[data-line]')?.querySelector<HTMLElement>(`.${to}`)?.focus()
  }
</script>

<div
  class="rows lines"
  class:stale={b.stale}
  role={plays ? 'list' : undefined}
  bind:this={list}
  style:height="{v.total}px"
  use:roving={{ rows: items, count: items.length, scrollTo: (i) => v.scrollToIndex(i) }}
>
  {#each v.items as item (item.key)}
    {@const x = items[item.index]}
    {@const r = b.row(x)}
    {@const more = r.details ?? []}
    {@const cols = more.length
      ? `${plays ? 44 : 40}px minmax(0, 1fr) repeat(${more.length}, auto) 5.5em${plays ? '' : ' 16px'}`
      : undefined}
    {#if isItem(r)}
      {@const key = b.key(x)}
      {@const cur = current === r.play}
      <div
        class="row line"
        class:cur-row={cur}
        role="listitem"
        data-line
        style:transform="translateY({v.offset(item)}px)"
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
          onkeydown={(e) => onrowkey(e, 'star')}
          onclick={() => void queues.playItem(r.play)}
        >
          <Thumb src={r.art} size={44} radius={6} eq={cur && sounds} busy={cur && busy} />
          <span class="nm">
            <span class="t"><span>{r.title}</span></span>
            {#if r.subtitle}<span class="where" title={r.subtitle}>{r.subtitle}</span>{/if}
          </span>
          {#each more as d, i (i)}<span class="n">{d}</span>{/each}
          <span class="n" class:end={more.length > 0}>{r.meta ?? ''}</span>
        </button>
        {#if r.star}
          {@const s = r.star}
          <button
            class="star"
            class:on={s.on}
            tabindex="-1"
            onkeydown={(e) => onrowkey(e, 'main')}
            aria-pressed={s.on}
            title={s.label}
            onclick={() => actOnPage(plugin, key, 'star')}
            ><Icon name={s.on ? 'starOn' : 'star'} size={20} /></button
          >
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
        <Thumb src={r.art} size={40} radius={6} />
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
  .star {
    width: 40px;
    height: 40px;
    margin-right: 6px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    color: var(--ink-3);
    flex: none;
  }
  .star:hover {
    background: var(--hover);
    color: var(--ink);
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
