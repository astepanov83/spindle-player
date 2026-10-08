<!-- A tiles block: covers (albums) or round pictures (artists), drawn a row
     at a time so a big library stays fast. A tile is made only when its row
     is drawn. With groups, a heading row starts each group, and letters get
     an A-Z strip on the right (ticket 096). -->
<script lang="ts">
  import { untrack } from 'svelte'
  import type { PluginId } from '../../../shared/plugins'
  import ArtistPic from '../library/ArtistPic.svelte'
  import { sections, songMenu } from '../library/song-menu'
  import { gridLayout, gridPlaces } from '../library/grid-rows'
  import { groupRuns, stripLetters, type Run } from '../library/groups'
  import { gridColumns } from '../library/views'
  import Cover from '../ui/Cover.svelte'
  import Eq from '../ui/Eq.svelte'
  import Icon from '../ui/Icon.svelte'
  import { keepPlace } from '../ui/keep-place.svelte'
  import { addFinder } from '../ui/item-finder'
  import { virtualList } from '../ui/virtual-list.svelte'
  import { actOnPage, itemsVersion, openFrom } from '../plugins'
  import type { Tile, TilesBlock } from '../plugins/types'
  import { menu } from '../stores/menu.svelte'
  import { player } from '../stores/player.svelte'
  import { queues } from '../stores/queues.svelte'
  import { queue } from '../stores/queue.svelte'
  import { theme } from '../stores/theme.svelte'
  import { songDrag } from '../stores/song-drag.svelte'
  import TileHeading from './TileHeading.svelte'

  let {
    block: b,
    tab,
    plugin,
    scrollEl
  }: {
    block: TilesBlock
    tab: string
    plugin: PluginId
    scrollEl: HTMLElement | undefined
  } = $props()

  // the same both ways (ticket 096)
  const GAP = 20
  // heading rows have set heights, so the rows above the screen are known
  const LETTER_HEAD = 52
  const ARTIST_HEAD = 76
  let list: HTMLDivElement | undefined = $state()
  let width = $state(0)

  const items = $derived(b.items as unknown[])
  const cols = $derived(gridColumns(width, b.small ? 116 : 140, GAP))
  const runs = $derived(b.groups && groupRuns(items, b.groups.grouping))
  const layout = $derived(gridLayout(items, cols, runs))
  const rows = $derived(layout.rows)
  const headSize = $derived(b.groups?.artist ? ARTIST_HEAD : LETTER_HEAD)
  // picture + a two-line title + line under, measured for real once drawn.
  // Two lines: at 140px most rows have a title that wraps, and a row guessed
  // short shrinks the page above the screen until it is drawn.
  const TITLE_LINE = 18
  const estimate = $derived(
    (width - GAP * (cols - 1)) / cols + (b.round ? 50 : 44) + TITLE_LINE + GAP
  )
  // A new function measures every row again, so not on a new list: a scan
  // adds rows every few seconds.
  const size = $derived.by(() => {
    const tile = estimate
    const head = headSize
    return (i: number): number => (untrack(() => 'head' in (rows[i] ?? {})) ? head : tile)
  })
  // a measured height stays with its row when rows come above it
  const rowKey = $derived.by(() => {
    const r = rows
    return (i: number): string => r[i]?.key ?? `${i}`
  })

  // rows ahead, so a fast scroll finds them drawn
  const v = virtualList(
    () => ({ count: rows.length, scrollEl, list, size, key: rowKey, remeasure: true }),
    6
  )

  // tile rows' height on average, to place the rows not drawn
  const tileRow = $derived.by(() => {
    const heads = runs?.length ?? 0
    const tiles = rows.length - heads
    return tiles ? (v.total - heads * headSize) / tiles : 0
  })

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
    per: cols,
    rowSize: tileRow,
    key: (x: unknown) => b.key(x),
    places: (list: unknown[]) =>
      gridPlaces(gridLayout(list, cols, runsOf(list)), list.length, headSize, tileRow),
    source: itemsVersion()
  }))

  // so another look of the view can start at a tile not drawn (ticket 095)
  $effect(() =>
    addFinder((key) => {
      const i = items.findIndex((x) => b.key(x) === key)
      return i < 0 ? undefined : v.startOf(layout.rowOf(i))
    })
  )

  // the library's size: the strip goes under 520px (ticket 043's narrow
  // widths), and scrolls when its letters don't fit the height
  let boxWidth = $state(0)
  let boxHeight = $state(0)
  $effect(() => {
    const el = scrollEl
    if (!el) return
    const sizes = new ResizeObserver(() => {
      boxWidth = el.getBoundingClientRect().width
      boxHeight = el.clientHeight
    })
    sizes.observe(el)
    return () => sizes.disconnect()
  })

  // the A-Z strip, while the headings are letters or artists
  const strip = $derived(
    b.groups?.strip && runs && boxWidth >= 520 ? stripLetters(runs) : undefined
  )
  // the first heading row of each letter
  const letterRows = $derived.by(() => {
    const at: Record<string, number> = {}
    rows.forEach((r, i) => {
      const l = 'head' in r ? r.head.letter : undefined
      if (l !== undefined) at[l] ??= i
    })
    return at
  })

  function measure(node: HTMLDivElement): void {
    v.measure(node)
  }

  // not while radio plays
  const playing = (t: Tile): boolean => !!queues.item && !!t.playing?.(queues.item)

  // A tile dragged takes all its songs to a playlist or the queue (ticket 089).
  function press(e: PointerEvent, t: Tile): void {
    songDrag.press(e, () => ({
      keys: t.songs(),
      from: t.from,
      link: t.link,
      title: t.title,
      sub: t.subtitle,
      cover: t.art?.cover ?? t.photo
    }))
  }

  // the click that ends a drag opens and plays nothing
  const unlessDragged = (run: () => void) => (): void => {
    if (!songDrag.tookClick()) run()
  }

  function openMenu(e: MouseEvent, x: unknown, t: Tile): void {
    const key = b.key(x)
    menu.showFor(
      e,
      sections(
        songMenu(t.songs(), { from: t.from, link: t.link }),
        (t.actions ?? []).map((a) => ({
          label: a.label,
          run: () => actOnPage(plugin, key, a.id)
        }))
      )
    )
  }
</script>

<div class="tiles" class:with-strip={!!strip}>
  <!-- before the grid, so Tab reaches it without going through every tile -->
  {#if strip}
    <nav class="strip" aria-label="Go to letter" style:max-height="{boxHeight - 8}px">
      {#each strip as s (s.letter)}
        <button
          disabled={!s.has}
          aria-label={s.letter === '#' ? 'Numbers and symbols' : s.letter}
          onclick={() => v.scrollToIndex(letterRows[s.letter])}>{s.letter}</button
        >
      {/each}
    </nav>
  {/if}
  <div
    class="grid"
    data-grid={b.round ? 'round' : 'square'}
    bind:this={list}
    bind:clientWidth={width}
    style:height="{v.total}px"
  >
    {#each v.items as item (item.key)}
      {@const row = rows[item.index]}
      {#if row && 'head' in row}
        <div
          class="gridrow headrow"
          data-index={item.index}
          use:measure
          style:height="{headSize}px"
          style:transform="translateY({v.offset(item)}px)"
        >
          <TileHeading
            heading={row.head}
            artist={b.groups?.artist?.(row.head, items.slice(row.run.start, row.run.end))}
            {tab}
          />
        </div>
      {:else if row}
        <div
          class="gridrow"
          data-index={item.index}
          use:measure
          style:grid-template-columns="repeat({cols}, minmax(0, 1fr))"
          style:transform="translateY({v.offset(item)}px)"
        >
          {#each row.items as x (b.key(x))}
            {@const t = b.tile(x)}
            <div
              class="card"
              class:round={b.round}
              data-item={b.key(x)}
              role="group"
              onpointerdown={(e) => press(e, t)}
              oncontextmenu={(e) => openMenu(e, x, t)}
            >
              <div class="wrap">
                <button
                  class="pic"
                  aria-label="Open {t.title}"
                  onclick={unlessDragged(() => openFrom(tab, t.to))}
                  >{#if b.round}<ArtistPic photo={t.photo} covers={t.covers ?? []} />{:else}<Cover
                      src={t.art?.cover}
                      tint={t.art?.palette[theme.light ? 'light' : 'dark'][0]}
                      lazy={false}
                    />{/if}</button
                >
                <button
                  class="qp"
                  aria-label="Play {t.title}"
                  onclick={unlessDragged(() => queue.playList(t.songs(), 0, t.from, t.link))}
                >
                  <Icon name="play" />
                </button>
              </div>
              <div class="t">
                {#if playing(t)}<Eq paused={!player.playing} />{/if}<span title={t.title}
                  >{t.title}</span
                >
              </div>
              <div class="a">{t.subtitle ?? ''}</div>
            </div>
          {/each}
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .with-strip {
    display: flex;
    gap: 8px;
  }
  .grid {
    position: relative;
    flex: 1;
    min-width: 0;
  }
  .gridrow {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: grid;
    column-gap: 20px;
    padding-bottom: 20px;
  }
  .headrow {
    display: block;
    padding-bottom: 0;
  }
  /* stays in view while the grid scrolls under it */
  .strip {
    order: 1;
    position: sticky;
    top: 4px;
    align-self: flex-start;
    overflow-y: auto;
    scrollbar-width: none;
    display: flex;
    flex-direction: column;
    margin-right: -10px;
  }
  .strip button {
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
    padding: 2px 4px;
    min-width: 18px;
    color: var(--ink-2);
    border-radius: 4px;
  }
  .strip button:hover:not(:disabled) {
    color: var(--ink);
    background: var(--field);
  }
  .strip button:disabled {
    color: var(--ink-3);
    opacity: 0.4;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-align: left;
    min-width: 0;
  }
  .round {
    align-items: center;
    text-align: center;
  }
  .wrap {
    position: relative;
  }
  .round .wrap {
    width: 100%;
  }
  .pic {
    display: block;
    width: 100%;
    position: relative;
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 8px 20px -10px var(--shadow);
    transition: transform 0.2s;
  }
  .round .pic {
    position: static;
    border-radius: 50%;
    overflow: visible;
  }
  .card:hover .pic {
    transform: translateY(-3px);
  }
  .qp {
    position: absolute;
    right: 8px;
    bottom: 8px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--ink);
    color: var(--bg);
    display: grid;
    place-items: center;
    opacity: 0;
    transform: translateY(6px);
    transition: 0.2s;
    box-shadow: 0 6px 14px var(--shadow);
  }
  .round .qp {
    right: 4%;
    bottom: 4%;
  }
  .card:hover .qp,
  .card:focus-within .qp {
    opacity: 1;
    transform: none;
  }
  .card .qp:hover {
    transform: scale(1.06);
  }
  .card .qp:active {
    transform: scale(0.96);
  }
  /* A set line height: with the default one, a Japanese fallback font makes
     its line taller, so its names sat lower than the others in the row. */
  .t,
  .a {
    line-height: 1.3;
  }
  .t {
    font-size: var(--text-m);
    font-weight: 600;
    display: flex;
    gap: 6px;
    align-items: center;
    min-width: 0;
  }
  .round .t {
    justify-content: center;
    max-width: 100%;
  }
  /* two lines, then cut; the whole title is in the tooltip */
  .t span {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .a {
    font-size: var(--text-s);
    color: var(--ink-2);
    margin-top: -5px;
  }
  .round .a {
    color: var(--ink-3);
  }
  /* no lift or slide with reduced motion; the play button still fades in */
  @media (prefers-reduced-motion: reduce) {
    .card:hover .pic,
    .qp,
    .card .qp:hover {
      transform: none;
    }
  }
</style>
