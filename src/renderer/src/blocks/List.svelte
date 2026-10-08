<!-- A list block (ticket 097): albums or artists as rows, only the rows on
     screen drawn. With groups, a heading row starts each group and stays at
     the top while its rows scroll, and letters get the A-Z strip. Without,
     plain rows (an artist's albums). The keys are the song table's: one Tab
     stop, the arrows move by row and skip the headings; Enter opens, Space
     plays. -->
<script lang="ts">
  import { untrack } from 'svelte'
  import type { PluginId } from '../../../shared/plugins'
  import ArtistPic from '../library/ArtistPic.svelte'
  import { sections, songMenu } from '../library/song-menu'
  import { gridLayout, gridPlaces, headSizes, letterRows, type GridRow } from '../library/grid-rows'
  import { groupRuns, type Heading, type Run } from '../library/groups'
  import { listColumns, scrollRow, stuckHead } from '../library/list-rows'
  import Cover from '../ui/Cover.svelte'
  import Eq from '../ui/Eq.svelte'
  import Icon from '../ui/Icon.svelte'
  import { addFinder } from '../ui/item-finder'
  import { keepPlace } from '../ui/keep-place.svelte'
  import { roving } from '../ui/roving'
  import { virtualList } from '../ui/virtual-list.svelte'
  import { actOnPage, itemsVersion, openFrom } from '../plugins'
  import type { CoverArt, ListBlock, ListRow } from '../plugins/types'
  import { menu } from '../stores/menu.svelte'
  import { player } from '../stores/player.svelte'
  import { queue } from '../stores/queue.svelte'
  import { queues } from '../stores/queues.svelte'
  import { songDrag } from '../stores/song-drag.svelte'
  import { theme } from '../stores/theme.svelte'
  import LetterStrip from './LetterStrip.svelte'
  import { playPage } from './page-play'
  import TileHeading from './TileHeading.svelte'

  let {
    block: b,
    tab,
    plugin,
    scrollEl
  }: {
    block: ListBlock
    tab: string
    plugin: PluginId
    scrollEl: HTMLElement | undefined
  } = $props()

  // a 48px picture and room around it
  const ROW = 60
  // the column heads' height (.song-head), which stick over the top
  const HEADS = 38

  let list: HTMLDivElement | undefined = $state()
  let width = $state(0)

  const items = $derived(b.items as unknown[])
  const runs = $derived(b.groups && groupRuns(items, b.groups.grouping))
  const layout = $derived(gridLayout(items, 1, runs))
  const rows = $derived(layout.rows)
  const headSize = $derived(b.groups?.artist ? headSizes.artist : headSizes.letter)
  // Every row's height is known, so none is measured. A new function sizes
  // every row again, so not on a new list.
  const size = $derived.by(() => {
    const head = headSize
    return (i: number): number => (untrack(() => 'head' in (rows[i] ?? {})) ? head : ROW)
  })
  // a new list of rows names its rows again, so the sizes follow
  const rowKey = $derived.by(() => {
    const r = rows
    return (i: number): string => r[i]?.key ?? `${i}`
  })

  // a jump to a row leaves it clear of the column heads
  const v = virtualList(
    () => ({ count: rows.length, scrollEl, list, size, key: rowKey, paddingStart: HEADS }),
    10
  )

  // the last list's runs: the place is worked out on the list before a
  // scan's change and the one after
  let ranFor: { items: unknown[]; runs: Run[] | undefined } | undefined
  function runsOf(list: unknown[]): Run[] | undefined {
    if (list === items) return runs
    if (ranFor?.items !== list)
      ranFor = { items: list, runs: b.groups && groupRuns(list, b.groups.grouping) }
    return ranFor.runs
  }

  keepPlace(() => ({
    scrollEl,
    list,
    items,
    per: 1,
    rowSize: ROW,
    key: (x: unknown) => b.key(x),
    places: (list: unknown[]) =>
      gridPlaces(gridLayout(list, 1, runsOf(list)), list.length, headSize, ROW),
    source: itemsVersion()
  }))

  // so another look of the view can start at a row not drawn (ticket 095)
  $effect(() =>
    addFinder((key) => {
      const i = items.findIndex((x) => b.key(x) === key)
      return i < 0 ? undefined : v.startOf(layout.rowOf(i))
    })
  )

  const letters = $derived(letterRows(rows))

  // How far down the list the bottom of the column heads is, for the
  // heading held under them.
  let y = $state(0)
  $effect(() => {
    const box = scrollEl
    const el = list
    if (!box || !el || !runs) return
    const read = (): void => {
      y = box.getBoundingClientRect().top + HEADS - el.getBoundingClientRect().top
    }
    read()
    box.addEventListener('scroll', read, { passive: true })
    const sizes = new ResizeObserver(read)
    sizes.observe(box)
    return () => {
      box.removeEventListener('scroll', read)
      sizes.disconnect()
    }
  })
  const stuck = $derived(runs ? stuckHead(layout, y, headSize, ROW) : undefined)

  // the columns that fit, the narrow way as the song table (ticket 043)
  const fit = $derived(listColumns(width, b.cols.length))
  const shown = $derived(b.cols.slice(0, fit.shown))
  const template = $derived(`48px minmax(0, 1fr)${shown.map((c) => ` ${c.width}px`).join('')}`)

  // not while radio plays
  const playing = (r: ListRow): boolean => !!queues.item && !!r.playing?.(queues.item)

  // in the markup this would lose its spaces next to a block
  const dot = ' · '

  const tint = (c: CoverArt): string => c.palette[theme.light ? 'light' : 'dark'][0]

  // A row dragged takes all its songs to a playlist or the queue (ticket 089).
  function press(e: PointerEvent, r: ListRow): void {
    songDrag.press(e, () => ({
      keys: r.songs(),
      from: r.from,
      link: r.link,
      title: r.title,
      sub: r.subtitle,
      cover: r.art?.cover ?? r.photo
    }))
  }

  // the click that ends a drag opens and plays nothing
  const unlessDragged = (run: () => void) => (): void => {
    if (!songDrag.tookClick()) run()
  }

  function openMenu(e: MouseEvent, x: unknown, r: ListRow): void {
    const key = b.key(x)
    menu.showFor(
      e,
      sections(
        songMenu(r.songs(), { from: r.from, link: r.link }),
        (r.actions ?? []).map((a) => ({
          label: a.label,
          run: () => actOnPage(plugin, key, a.id)
        }))
      )
    )
  }

  // Right and Left step through a row's buttons: the row, play, the artist.
  function onrowkey(e: KeyboardEvent & { currentTarget: HTMLElement }): void {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const line = e.currentTarget.closest('[data-line]')
    const all = [...(line?.querySelectorAll<HTMLElement>('button') ?? [])]
    const at = all.indexOf(e.currentTarget) + (e.key === 'ArrowRight' ? 1 : -1)
    all[at]?.focus()
  }

  // Space plays the row, or pauses and resumes it while it plays, as a
  // page's Play. Enter opens it (the button's click).
  function onmainkey(e: KeyboardEvent & { currentTarget: HTMLElement }, r: ListRow): void {
    if (e.code === 'Space' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault()
      playPage('all', r.songs, r.from, r.link)
      return
    }
    onrowkey(e)
  }
</script>

<!-- The list is one Tab stop, so a heading's buttons are for the pointer:
     a row's Right arrow reaches its artist. -->
{#snippet heading(r: Extract<GridRow<unknown>, { head: Heading }>)}
  <TileHeading
    heading={r.head}
    artist={b.groups?.artist?.(r.head, items.slice(r.run.start, r.run.end))}
    {tab}
    tabbable={false}
  />
{/snippet}

<div class="wrap">
  {#if b.groups?.strip && runs}
    <LetterStrip {runs} {scrollEl} go={(l) => v.scrollToIndex(letters[l])} />
  {/if}
  <div class="list" class:round={b.round} bind:clientWidth={width}>
    <!-- for the eye only: they don't sort, and the rows say it all -->
    <div class="heads song-head" aria-hidden="true" style:grid-template-columns={template}>
      <span></span>
      <span>{b.title}</span>
      {#each shown as c (c.head)}<span class="num">{c.head}</span>{/each}
    </div>
    <div
      class="rows lines"
      class:grouped={!!runs}
      style:--head="{headSize}px"
      bind:this={list}
      style:height="{v.total}px"
      use:roving={{
        rows: items,
        count: items.length,
        scrollTo: (i) => v.scrollToIndex(scrollRow(layout, i))
      }}
    >
      <!-- the heading of the rows at the top, held under the column heads -->
      {#if stuck}
        {@const r = rows[stuck.row]}
        {#if r && 'head' in r}
          <div
            class="stuck"
            aria-hidden="true"
            style:height="{headSize}px"
            style:transform="translateY({stuck.shift}px)"
          >
            {@render heading(r)}
          </div>
        {/if}
      {/if}
      {#each v.items as item (item.key)}
        {@const row = rows[item.index]}
        {#if row && 'head' in row}
          <div
            class="headrow"
            style:height="{headSize}px"
            style:transform="translateY({v.offset(item)}px)"
          >
            {@render heading(row)}
          </div>
        {:else if row}
          {@const x = row.items[0]}
          {@const key = b.key(x)}
          {@const r = b.row(x)}
          {@const on = playing(r)}
          {@const under = fit.under ? (r.under ?? r.cols[0]) : ''}
          <div
            class="line row"
            role="group"
            data-line
            data-item={key}
            style:grid-template-columns={template}
            style:transform="translateY({v.offset(item)}px)"
            onpointerdown={(e) => press(e, r)}
            oncontextmenu={(e) => openMenu(e, x, r)}
          >
            <button
              class="main"
              data-row
              data-index={row.start}
              aria-label={r.label}
              title={r.title}
              aria-current={on ? 'true' : undefined}
              onclick={unlessDragged(() => openFrom(tab, r.to))}
              onkeydown={(e) => onmainkey(e, r)}
            ></button>
            <span class="pic"
              >{#if b.round}<ArtistPic photo={r.photo} covers={r.covers ?? []} />{:else}<Cover
                  src={r.art?.cover}
                  tint={r.art?.palette[theme.light ? 'light' : 'dark'][0]}
                  lazy={false}
                />{/if}<button
                class="qp"
                tabindex="-1"
                aria-label="Play {r.title}"
                onkeydown={onrowkey}
                onclick={unlessDragged(() => queue.playList(r.songs(), 0, r.from, r.link))}
                ><Icon name="play" size={18} /></button
              ></span
            >
            <span class="words">
              <span class="t"
                >{#if on}<Eq paused={!player.playing} />{/if}<span>{r.title}</span></span
              >
              {#if r.subtitle || under}
                <span class="a"
                  >{#if r.subtitle && r.subTo}{@const to = r.subTo}<button
                      class="link"
                      tabindex="-1"
                      onkeydown={onrowkey}
                      onclick={unlessDragged(() => openFrom(tab, to))}>{r.subtitle}</button
                    >{:else if r.subtitle}{r.subtitle}{/if}{#if r.subtitle && under}{dot}{/if}{under}</span
                >
              {:else if r.strip?.length}
                <span class="covers">
                  {#each r.strip as c, j (j)}<span class="mini"
                      ><Cover src={c.cover} tint={tint(c)} lazy={false} /></span
                    >{/each}
                </span>
              {/if}
            </span>
            {#each r.cols.slice(0, fit.shown) as c, j (j)}<span class="num">{c}</span>{/each}
          </div>
        {/if}
      {/each}
    </div>
  </div>
</div>

<style>
  .wrap {
    display: flex;
    gap: 8px;
  }
  .list {
    flex: 1;
    min-width: 0;
  }
  .heads,
  .line {
    display: grid;
    gap: 14px;
    align-items: center;
    padding: 0 12px;
  }
  /* over the heading held under it, which slides up under it */
  .heads {
    z-index: 2;
  }
  .num {
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rows {
    position: relative;
  }
  .headrow,
  .line {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
  }
  .stuck {
    position: sticky;
    top: calc(38px - var(--scroll-pad-top, 20px));
    z-index: 1;
    margin-bottom: calc(-1 * var(--head));
    background: var(--bg);
  }
  .line {
    height: 60px;
  }
  /* The row's button lies under the rest, so a click anywhere opens; the
     play button and the artist's name sit over it. */
  .main {
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }
  .line > :not(.main) {
    pointer-events: none;
  }
  .qp,
  .link {
    pointer-events: auto;
  }
  /* Up and Down keep the focused row clear of the heads that stick */
  .main {
    scroll-margin-top: calc(38px + var(--scroll-pad-top, 20px));
  }
  .grouped .main {
    scroll-margin-top: calc(38px + var(--head) + var(--scroll-pad-top, 20px));
  }
  .pic {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 6px;
    overflow: hidden;
  }
  .round .pic {
    border-radius: 50%;
    overflow: visible;
  }
  .qp {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    border-radius: inherit;
    background: rgb(0 0 0 / 0.45);
    color: #fff;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .line:hover .qp,
  .line:focus-within .qp {
    opacity: 1;
  }
  .words {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  /* A set line height: a Japanese fallback font would make its line taller. */
  .t,
  .a {
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .t {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: var(--text-m);
    font-weight: 600;
  }
  .t span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .a,
  .num {
    font-size: var(--text-s);
    color: var(--ink-2);
    font-variant-numeric: tabular-nums;
  }
  .link {
    position: relative;
    font: inherit;
    color: inherit;
  }
  .link:hover {
    color: var(--ink);
    text-decoration: underline;
  }
  .covers {
    display: flex;
    gap: 4px;
  }
  .mini {
    width: 18px;
    height: 18px;
    border-radius: 3px;
    overflow: hidden;
  }
</style>
