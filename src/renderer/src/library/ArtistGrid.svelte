<!-- Artists as round pictures, drawn a row at a time like the album grid, so
     10k artists stay fast. -->
<script lang="ts">
  import { queueLink } from '../../../shared/saved-queue'
  import { fmtCount } from '../format'
  import Empty from './Empty.svelte'
  import ArtistPic from './ArtistPic.svelte'
  import Eq from '../ui/Eq.svelte'
  import Icon from '../ui/Icon.svelte'
  import { artistKey, namesOf, type Artist } from '../../../shared/artists'
  import type { Album, Art } from '../../../shared/library'
  import { artistCovers, artistSongs, filterArtists } from './artists'
  import { chunk, gridColumns } from './views'
  import { virtualList } from '../ui/virtual-list.svelte'
  import { keepPlace } from '../ui/keep-place.svelte'
  import { library } from '../stores/library.svelte'
  import { menu } from '../stores/menu.svelte'
  import { player } from '../stores/player.svelte'
  import { queue } from '../stores/queue.svelte'
  import { sections, songMenu } from './song-menu'
  import { playingTrack, trackKeys } from '../plugins/files/views'
  import { openArtist } from '../plugins/files/nav'

  let {
    scrollEl,
    items,
    onopen = open
  }: {
    scrollEl: HTMLElement | undefined
    // these artists instead of the library's, with no search (search results)
    items?: Artist[]
    onopen?: (key: string) => void
  } = $props()

  // the grid shows over the open page while searching; a pick is a step, which ends the search
  function open(key: string): void {
    openArtist(key)
  }

  const GAP = 16
  const ROW_GAP = 22
  let list: HTMLDivElement | undefined = $state()
  let width = $state(0)

  const artists = $derived(items ?? filterArtists(library.artists, library.query))
  const cols = $derived(gridColumns(width, 140, GAP))
  const rows = $derived(chunk(artists, cols))
  // picture + name + count, measured for real once drawn
  const estimate = $derived((width - GAP * (cols - 1)) / cols + 50 + ROW_GAP)

  // rows ahead, so a fast scroll finds them drawn
  const v = virtualList(
    () => ({ count: rows.length, scrollEl, list, size: estimate, remeasure: true }),
    6
  )

  keepPlace(() => ({
    scrollEl,
    list,
    items: artists,
    per: cols,
    rowSize: rows.length ? v.total / rows.length : 0,
    key: (a: Artist) => a.key,
    source: library.revision
  }))

  function measure(node: HTMLDivElement): void {
    v.measure(node)
  }

  // the artists of the song playing (not while radio plays): its album's and its own
  const playing = $derived.by(() => {
    const t = playingTrack()
    if (!t) return new Set<string>()
    return new Set([...namesOf(library.album(t.albumId)), ...namesOf(t)].map(artistKey))
  })

  function edit(a: Artist): void {
    onopen(a.key)
    library.editingArtist = a.key
  }

  const album = (id: string): Album => library.album(id)
  const songArt = (id: string): Art => library.art(library.track(id))
  // albums, or songs for an artist with only songs on other albums
  const count = (a: Artist): string =>
    a.albums.length
      ? fmtCount(a.albums.length, 'album', 'albums')
      : fmtCount(a.also.length, 'song', 'songs')
</script>

{#if !items && !artists.length}
  <Empty title="No matches" text="No artist has that in their name." />
{/if}
<div
  class="grid"
  data-grid="artists"
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
      {#each rows[item.index] as a (a.key)}
        <div
          class="card"
          role="group"
          oncontextmenu={(e) =>
            menu.showFor(
              e,
              sections(
                songMenu(trackKeys(artistSongs(a, album)), {
                  from: a.name,
                  link: queueLink('artist', a.key)
                }),
                [{ label: 'Edit artist', run: () => edit(a) }]
              )
            )}
        >
          <div class="picwrap">
            <button class="pic" aria-label="Open {a.name}" onclick={() => onopen(a.key)}
              ><ArtistPic
                photo={library.photos[a.key]?.cover}
                covers={artistCovers(a, album, songArt)}
              /></button
            >
            <button
              class="qp"
              aria-label="Play {a.name}"
              onclick={() =>
                queue.playList(
                  trackKeys(artistSongs(a, album)),
                  0,
                  a.name,
                  queueLink('artist', a.key)
                )}
            >
              <Icon name="play" />
            </button>
          </div>
          <div class="t">
            {#if playing.has(a.key)}<Eq paused={!player.playing} />{/if}<span title={a.name}
              >{a.name}</span
            >
          </div>
          <div class="a">{count(a)}</div>
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
    align-items: center;
    gap: 8px;
    text-align: center;
    min-width: 0;
  }
  .picwrap {
    position: relative;
    width: 100%;
  }
  .pic {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 50%;
    box-shadow: 0 8px 20px -10px var(--shadow);
    transition: transform 0.2s;
  }
  .card:hover .pic {
    transform: translateY(-3px);
  }
  .qp {
    position: absolute;
    right: 4%;
    bottom: 4%;
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
    justify-content: center;
    max-width: 100%;
    min-width: 0;
  }
  .t span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .a {
    font-size: var(--text-s);
    color: var(--ink-3);
    margin-top: -5px;
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
