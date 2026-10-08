<!-- A tiles block: covers (albums) or round pictures (artists), drawn a row
     at a time so a big library stays fast. A tile is made only when its row
     is drawn. With groups, a heading row starts each group, and letters get
     an A-Z strip on the right (ticket 096). -->
<script lang="ts">
  import { untrack } from 'svelte'
  import type { PluginId } from '../../../shared/plugins'
  import ArtistPic from '../library/ArtistPic.svelte'
  import { gridLayout, gridPlaces, headSizes, letterRows } from '../library/grid-rows'
  import { groupRuns, type Run } from '../library/groups'
  import { gridColumns } from '../library/views'
  import Cover from '../ui/Cover.svelte'
  import Eq from '../ui/Eq.svelte'
  import Icon from '../ui/Icon.svelte'
  import { keepPlace } from '../ui/keep-place.svelte'
  import { addFinder } from '../ui/item-finder'
  import { virtualList } from '../ui/virtual-list.svelte'
  import { itemsVersion, openFrom } from '../plugins'
  import type { TilesBlock } from '../plugins/types'
  import { player } from '../stores/player.svelte'
  import { queue } from '../stores/queue.svelte'
  import { theme } from '../stores/theme.svelte'
  import LetterStrip from './LetterStrip.svelte'
  import TileHeading from './TileHeading.svelte'
  import { runsCache, tileMenu, tilePlaying, tilePress, unlessDragged } from './tile-acts'

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
  let list: HTMLDivElement | undefined = $state()
  let width = $state(0)

  const items = $derived(b.items as unknown[])
  const cols = $derived(gridColumns(width, b.small ? 116 : 140, GAP))
  const runs = $derived(b.groups && groupRuns(items, b.groups.grouping))
  const layout = $derived(gridLayout(items, cols, runs))
  const rows = $derived(layout.rows)
  const headSize = $derived(b.groups?.artist ? headSizes.artist : headSizes.letter)
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

  const runsFor = runsCache()
  const runsOf = (list: unknown[]): Run[] | undefined =>
    list === items ? runs : runsFor(list, b.groups)

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

  // the first heading row of each letter, for the strip
  const letters = $derived(letterRows(rows))

  function measure(node: HTMLDivElement): void {
    v.measure(node)
  }
</script>

<div class="tiles">
  {#if b.groups?.strip && runs}
    <LetterStrip {runs} {scrollEl} go={(l) => v.scrollToIndex(letters[l])} />
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
              onpointerdown={(e) => tilePress(e, t)}
              oncontextmenu={(e) => tileMenu(e, plugin, b.key(x), t)}
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
                {#if tilePlaying(t)}<Eq paused={!player.playing} />{/if}<span title={t.title}
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
  .tiles {
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
