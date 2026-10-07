<!-- A tiles block: covers (albums) or round pictures (artists), drawn a row
     at a time so a big library stays fast. A tile is made only when its row
     is drawn. -->
<script lang="ts">
  import type { PluginId } from '../../../shared/plugins'
  import ArtistPic from '../library/ArtistPic.svelte'
  import { sections, songMenu } from '../library/song-menu'
  import { chunk, gridColumns } from '../library/views'
  import Cover from '../ui/Cover.svelte'
  import Eq from '../ui/Eq.svelte'
  import Icon from '../ui/Icon.svelte'
  import { keepPlace } from '../ui/keep-place.svelte'
  import { virtualList } from '../ui/virtual-list.svelte'
  import { actOnPage, itemsVersion, openFrom } from '../plugins'
  import type { Tile, TilesBlock } from '../plugins/types'
  import { menu } from '../stores/menu.svelte'
  import { player } from '../stores/player.svelte'
  import { queues } from '../stores/queues.svelte'
  import { queue } from '../stores/queue.svelte'
  import { theme } from '../stores/theme.svelte'
  import { songDrag } from '../stores/song-drag.svelte'

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

  const GAP = 16
  const ROW_GAP = 22
  let list: HTMLDivElement | undefined = $state()
  let width = $state(0)

  const items = $derived(b.items as unknown[])
  const cols = $derived(gridColumns(width, 140, GAP))
  const rows = $derived(chunk(items, cols))
  // picture + title + line under, measured for real once drawn
  const estimate = $derived((width - GAP * (cols - 1)) / cols + (b.round ? 50 : 44) + ROW_GAP)

  // rows ahead, so a fast scroll finds them drawn
  const v = virtualList(
    () => ({ count: rows.length, scrollEl, list, size: estimate, remeasure: true }),
    6
  )

  keepPlace(() => ({
    scrollEl,
    list,
    items,
    per: cols,
    rowSize: rows.length ? v.total / rows.length : 0,
    key: (x: unknown) => b.key(x),
    source: itemsVersion()
  }))

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

<div
  class="grid"
  data-grid={b.round ? 'round' : 'square'}
  bind:this={list}
  bind:clientWidth={width}
  style:height="{v.total}px"
>
  {#each v.items as item (item.key)}
    <div
      class="gridrow"
      data-index={item.index}
      use:measure
      style:grid-template-columns="repeat({cols}, minmax(0, 1fr))"
      style:transform="translateY({v.offset(item)}px)"
    >
      {#each rows[item.index] as x (b.key(x))}
        {@const t = b.tile(x)}
        <div
          class="card"
          class:round={b.round}
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
  {/each}
</div>

<style>
  .grid {
    position: relative;
  }
  .gridrow {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: grid;
    column-gap: 16px;
    padding-bottom: 22px;
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
  .t span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
