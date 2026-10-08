<!-- One shelf of the shelves look (ticket 098): an artist's heading, then
     their albums in one line that scrolls sideways. Only the tiles near the
     view are drawn. Shift + wheel and a touchpad scroll it; the ‹ › buttons
     show on hover when there is more that way. -->
<script lang="ts">
  import type { PluginId } from '../../../shared/plugins'
  import type { Heading } from '../library/groups'
  import { shelfPad, shelfStep, shelfWindow } from '../library/shelf-rows'
  import Icon from '../ui/Icon.svelte'
  import type { ArtistHeading, Tile } from '../plugins/types'
  import TileCard from './TileCard.svelte'
  import TileHeading from './TileHeading.svelte'

  let {
    heading,
    artist,
    tiles,
    tab,
    plugin,
    stop,
    start,
    keep
  }: {
    heading: Heading
    artist: ArtistHeading
    tiles: Tile[]
    tab: string
    plugin: PluginId
    // the place in the shelf that holds the Tab stop (-1 the heading); none
    // when another shelf has it
    stop: number | undefined
    // where the shelf was scrolled when it was last drawn
    start: number
    keep: (left: number) => void
  } = $props()

  let scroller: HTMLDivElement | undefined = $state()
  // the start only: the shelf keeps its own place after
  // svelte-ignore state_referenced_locally
  let left = $state(start)
  let width = $state(0)

  const win = $derived(shelfWindow(left, width, tiles.length))
  const track = $derived(Math.max(0, tiles.length * shelfStep - 16) + 2 * shelfPad)
  // the tile holding the Tab stop is not drawn: the heading takes it
  const headStop = $derived(
    stop === -1 || (stop !== undefined && (stop < win.start || stop >= win.end))
  )

  function place(node: HTMLDivElement): void {
    node.scrollLeft = start
  }

  function onscroll(): void {
    if (!scroller) return
    left = scroller.scrollLeft
    keep(left)
  }

  // a view's width less a tile, so the tile at the edge stays in view
  function page(dir: number): void {
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
    scroller?.scrollBy({
      left: dir * Math.max(shelfStep, width - shelfStep),
      behavior: calm ? 'auto' : 'smooth'
    })
  }
</script>

<div class="headbox">
  <TileHeading {heading} {artist} {tab} tabbable={headStop ? 'name' : false} />
</div>
<div class="shelfbox">
  <div class="shelf" bind:this={scroller} bind:clientWidth={width} use:place {onscroll}>
    <div class="track" style:width="{track}px">
      {#each tiles.slice(win.start, win.end) as t, k (win.start + k)}
        {@const j = win.start + k}
        <!-- room above for the lift on hover -->
        <div class="slot" data-at={j} style:transform="translateX({shelfPad + j * shelfStep}px)">
          <TileCard tile={t} key={t.to.page} {tab} {plugin} small stop={stop === j ? 0 : -1} />
        </div>
      {/each}
    </div>
  </div>
  <!-- for the pointer: the keys go along with Left and Right -->
  {#if left > 1}
    <button class="more back" tabindex="-1" aria-label="Scroll left" onclick={() => page(-1)}
      ><Icon name="back" size={18} /></button
    >
  {/if}
  {#if left + width < track - 1}
    <button class="more on" tabindex="-1" aria-label="Scroll right" onclick={() => page(1)}
      ><Icon name="forward" size={18} /></button
    >
  {/if}
</div>

<style>
  .headbox {
    height: 76px;
  }
  .shelfbox {
    position: relative;
  }
  /* Its own wheel is Shift + wheel and the touchpad; a plain wheel goes on
     to the page, since the shelf has nothing to scroll up or down. It
     reaches past the page's edge by the room around the tiles, so they line
     up with the heading. */
  .shelf {
    margin: 0 -4px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    height: 204px;
  }
  .track {
    position: relative;
    height: 100%;
  }
  .slot {
    position: absolute;
    top: 4px;
    left: 0;
    width: 132px;
  }
  /* over the covers' middle, at the shelf's ends */
  .more {
    position: absolute;
    top: 54px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--bg);
    color: var(--ink);
    box-shadow: 0 4px 12px var(--shadow);
    opacity: 0;
    transition: opacity 0.15s;
  }
  .back {
    left: 4px;
  }
  .on {
    right: 4px;
  }
  .shelfbox:hover .more {
    opacity: 1;
  }
  .more:hover {
    background: var(--field);
  }
</style>
