<!-- A tile: a cover (an album) or a round picture (an artist), its title
     and the line under. A click opens it, the play button over the picture
     plays it, right-click is its song menu, a drag takes its songs. The grid
     and the shelves both draw it, so a fix is made once. -->
<script lang="ts">
  import type { PluginId } from '../../../shared/plugins'
  import ArtistPic from '../library/ArtistPic.svelte'
  import Cover from '../ui/Cover.svelte'
  import Eq from '../ui/Eq.svelte'
  import Icon from '../ui/Icon.svelte'
  import { openFrom } from '../plugins'
  import type { Tile } from '../plugins/types'
  import { player } from '../stores/player.svelte'
  import { queue } from '../stores/queue.svelte'
  import { theme } from '../stores/theme.svelte'
  import { tileMenu, tilePlaying, tilePress, unlessDragged } from './tile-acts'

  let {
    tile: t,
    key,
    tab,
    plugin,
    round = false,
    small = false,
    item,
    stop
  }: {
    tile: Tile
    // the tile's key, for its own menu entries ("Edit artist")
    key: string
    tab: string
    plugin: PluginId
    round?: boolean
    // a smaller play button and one line under the title (the shelves)
    small?: boolean
    // data-item, for the scroll place of a look switch (ticket 095)
    item?: string
    // In a list with its own keys (the shelves): the cover's tabindex, and
    // the play button is no Tab stop. None: both are Tab stops (the grid).
    stop?: number
  } = $props()
</script>

<div
  class="card"
  class:round
  class:small
  data-item={item}
  role="group"
  onpointerdown={(e) => tilePress(e, t)}
  oncontextmenu={(e) => tileMenu(e, plugin, key, t)}
>
  <div class="wrap">
    <button
      class="pic"
      data-stop={stop === undefined ? undefined : ''}
      tabindex={stop}
      aria-label="Open {t.title}"
      onclick={unlessDragged(() => openFrom(tab, t.to))}
      >{#if round}<ArtistPic photo={t.photo} covers={t.covers ?? []} />{:else}<Cover
          src={t.art?.cover}
          tint={t.art?.palette[theme.light ? 'light' : 'dark'][0]}
          lazy={false}
        />{/if}</button
    >
    <button
      class="qp"
      tabindex={stop === undefined ? undefined : -1}
      aria-label="Play {t.title}"
      onclick={unlessDragged(() => queue.playList(t.songs(), 0, t.from, t.link))}
    >
      <Icon name="play" size={small ? 16 : undefined} />
    </button>
  </div>
  <div class="t">
    {#if tilePlaying(t)}<Eq paused={!player.playing} />{/if}<span title={t.title}>{t.title}</span>
  </div>
  <div class="a" title={small ? t.subtitle : undefined}>{t.subtitle ?? ''}</div>
</div>

<style>
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
  .small .qp {
    right: 6px;
    bottom: 6px;
    width: 32px;
    height: 32px;
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
  /* a shelf has room for one line under the title: cut, whole in the tooltip */
  .small .a {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
