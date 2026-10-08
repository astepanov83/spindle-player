<!-- A tiles block: covers (albums) or round pictures (artists), drawn a row
     at a time so a big library stays fast. A tile is made only when its row
     is drawn. With groups, a heading row starts each group, and letters get
     an A-Z strip on the right (ticket 096). -->
<script lang="ts">
  import { untrack } from 'svelte'
  import type { PluginId } from '../../../shared/plugins'
  import { gridLayout, gridPlaces, headSizes, letterRows } from '../library/grid-rows'
  import { groupRuns, type Run } from '../library/groups'
  import { gridColumns } from '../library/views'
  import { keepPlace } from '../ui/keep-place.svelte'
  import { addFinder } from '../ui/item-finder'
  import { virtualList } from '../ui/virtual-list.svelte'
  import { itemsVersion } from '../plugins'
  import type { TilesBlock } from '../plugins/types'
  import LetterStrip from './LetterStrip.svelte'
  import TileCard from './TileCard.svelte'
  import TileHeading from './TileHeading.svelte'
  import { runsCache } from './tile-acts'

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
            <TileCard
              tile={b.tile(x)}
              key={b.key(x)}
              item={b.key(x)}
              {tab}
              {plugin}
              round={b.round}
            />
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
</style>
