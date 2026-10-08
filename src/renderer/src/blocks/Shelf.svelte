<!-- One shelf of the shelves look (ticket 098): an artist's heading, then
     their albums in one line that scrolls sideways. Only the tiles near the
     view are drawn. Shift + wheel and a touchpad scroll it; the ‹ › buttons
     show on hover when there is more that way. -->
<script lang="ts">
  import type { PluginId } from '../../../shared/plugins'
  import type { Heading } from '../library/groups'
  import { shelfPad, shelfStep, shelfWindow } from '../library/shelf-rows'
  import Cover from '../ui/Cover.svelte'
  import Eq from '../ui/Eq.svelte'
  import Icon from '../ui/Icon.svelte'
  import { openFrom } from '../plugins'
  import type { ArtistHeading, Tile } from '../plugins/types'
  import { player } from '../stores/player.svelte'
  import { queue } from '../stores/queue.svelte'
  import { theme } from '../stores/theme.svelte'
  import TileHeading from './TileHeading.svelte'
  import { tileMenu, tilePlaying, tilePress, unlessDragged } from './tile-acts'

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
  <TileHeading {heading} {artist} {tab} tabbable={headStop} />
</div>
<div class="shelfbox">
  <div class="shelf" bind:this={scroller} bind:clientWidth={width} use:place {onscroll}>
    <div class="track" style:width="{track}px">
      {#each tiles.slice(win.start, win.end) as t, k (win.start + k)}
        {@const j = win.start + k}
        <div
          class="card"
          role="group"
          data-at={j}
          style:transform="translateX({shelfPad + j * shelfStep}px)"
          onpointerdown={(e) => tilePress(e, t)}
          oncontextmenu={(e) => tileMenu(e, plugin, t.to.page, t)}
        >
          <div class="wrap">
            <button
              class="pic"
              data-stop
              tabindex={stop === j ? 0 : -1}
              aria-label="Open {t.title}"
              onclick={unlessDragged(() => openFrom(tab, t.to))}
              ><Cover
                src={t.art?.cover}
                tint={t.art?.palette[theme.light ? 'light' : 'dark'][0]}
                lazy={false}
              /></button
            >
            <button
              class="qp"
              tabindex="-1"
              aria-label="Play {t.title}"
              onclick={unlessDragged(() => queue.playList(t.songs(), 0, t.from, t.link))}
            >
              <Icon name="play" size={16} />
            </button>
          </div>
          <div class="t">
            {#if tilePlaying(t)}<Eq paused={!player.playing} />{/if}<span title={t.title}
              >{t.title}</span
            >
          </div>
          <div class="a" title={t.subtitle}>{t.subtitle ?? ''}</div>
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
     to the page, since the shelf has nothing to scroll up or down. */
  /* reaches past the page's edge by the room around the tiles, so they
     line up with the heading */
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
  /* room above for the lift on hover */
  .card {
    position: absolute;
    top: 4px;
    left: 0;
    width: 132px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .wrap {
    position: relative;
  }
  .pic {
    display: block;
    width: 132px;
    height: 132px;
    position: relative;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 8px 20px -10px var(--shadow);
    transition: transform 0.2s;
  }
  .card:hover .pic {
    transform: translateY(-3px);
  }
  .qp {
    position: absolute;
    right: 6px;
    bottom: 6px;
    width: 32px;
    height: 32px;
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
  .card:hover .qp,
  .card:focus-within .qp {
    opacity: 1;
    transform: none;
  }
  .card .qp:hover {
    transform: scale(1.06);
  }
  /* A set line height, as the grid's: a Japanese fallback font would make
     its line taller. Two title lines at most, then cut; the whole one in
     the tooltip. The shelf has room for two. */
  .t,
  .a {
    line-height: 1.3;
  }
  .t {
    font-size: var(--text-m);
    font-weight: 600;
    display: flex;
    gap: 6px;
    align-items: flex-start;
    min-width: 0;
  }
  .t span {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .t :global(.eq) {
    margin-top: 3px;
  }
  .a {
    font-size: var(--text-s);
    color: var(--ink-2);
    margin-top: -5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
  @media (prefers-reduced-motion: reduce) {
    .card:hover .pic,
    .qp,
    .card .qp:hover {
      transform: none;
    }
  }
</style>
