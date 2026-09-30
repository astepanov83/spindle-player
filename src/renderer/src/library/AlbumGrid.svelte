<!-- Cover grid, drawn a row at a time so a big library stays fast. -->
<script lang="ts">
  import type { Album } from '../../../shared/library'
  import Empty from './Empty.svelte'
  import Cover from '../ui/Cover.svelte'
  import Eq from '../ui/Eq.svelte'
  import Icon from '../ui/Icon.svelte'
  import { chunk, filterAlbums, gridColumns } from './views'
  import { virtualList } from '../ui/virtual-list.svelte'
  import { keepPlace } from '../ui/keep-place.svelte'
  import { library } from '../stores/library.svelte'
  import { player } from '../stores/player.svelte'
  import { playing } from '../stores/playing.svelte'
  import { queue } from '../stores/queue.svelte'
  import { openSongMenu } from './song-menu'

  let {
    scrollEl,
    items,
    sub = 'artist',
    onopen = (id) => (library.open = id)
  }: {
    scrollEl: HTMLElement | undefined
    // these albums instead of the library's, with no search (an artist's)
    items?: Album[]
    // the line under the title: an artist's page names the year, not them again
    sub?: 'artist' | 'year'
    onopen?: (albumId: string) => void
  } = $props()

  const GAP = 16
  const ROW_GAP = 22
  let list: HTMLDivElement | undefined = $state()
  let width = $state(0)

  const albums = $derived(items ?? filterAlbums(library.albums, library.query))
  const cols = $derived(gridColumns(width, 140, GAP))
  const rows = $derived(chunk(albums, cols))
  // cover + title + artist, measured for real once drawn
  const estimate = $derived((width - GAP * (cols - 1)) / cols + 44 + ROW_GAP)

  const v = virtualList(
    () => ({ count: rows.length, scrollEl, list, size: estimate, remeasure: true }),
    3
  )

  keepPlace(() => ({
    scrollEl,
    list,
    items: albums,
    per: cols,
    rowSize: rows.length ? v.total / rows.length : 0,
    key: (a: Album) => a.id,
    source: library.revision
  }))

  function measure(node: HTMLDivElement): void {
    v.measure(node)
  }
</script>

{#if !items && !albums.length}
  <Empty title="No matches" text="Nothing found for this search. Try an album or artist name." />
{/if}
<div
  class="grid"
  data-grid="albums"
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
      {#each rows[item.index] as al (al.id)}
        <div
          class="card"
          role="group"
          oncontextmenu={(e) =>
            openSongMenu(e, al.trackIds, {
              from: al.title,
              link: { kind: 'album', id: al.id }
            })}
        >
          <div class="cvwrap">
            <button class="cv" aria-label="Open {al.title}" onclick={() => onopen(al.id)}
              ><Cover src={al.cover} /></button
            >
            <button
              class="qp"
              aria-label="Play {al.title}"
              onclick={() => queue.playAlbum(al.id, 0)}
            >
              <Icon name="play" />
            </button>
          </div>
          <div class="t">
            {#if al.id === playing.song?.albumId}<Eq paused={!player.playing} />{/if}<span
              title={al.title}>{al.title}</span
            >
          </div>
          <div class="a">{sub === 'year' ? al.year || '' : al.artist}</div>
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
  .cvwrap {
    position: relative;
  }
  .cv {
    display: block;
    width: 100%;
    position: relative;
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 8px 20px -10px var(--shadow);
    transition: transform 0.2s;
  }
  .card:hover .cv {
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
  /* no lift or slide with reduced motion; the play button still fades in */
  @media (prefers-reduced-motion: reduce) {
    .card:hover .cv,
    .qp,
    .card .qp:hover {
      transform: none;
    }
  }
</style>
