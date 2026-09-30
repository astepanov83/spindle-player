<!-- Artists as round pictures, drawn a row at a time like the album grid, so
     10k artists stay fast. -->
<script lang="ts">
  import Empty from './Empty.svelte'
  import ArtistPic from './ArtistPic.svelte'
  import Eq from '../ui/Eq.svelte'
  import Icon from '../ui/Icon.svelte'
  import { artistKey, namesOf, type Artist } from '../../../shared/artists'
  import { artistCovers, artistSongs, filterArtists } from './artists'
  import { chunk, gridColumns } from './views'
  import { virtualList } from '../ui/virtual-list.svelte'
  import { keepPlace } from '../ui/keep-place.svelte'
  import { library } from '../stores/library.svelte'
  import { menu } from '../stores/menu.svelte'
  import { queue } from '../stores/queue.svelte'
  import { sections, songMenu } from './song-menu'

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

  // the grid shows over the open page while searching, so a pick ends the search
  function open(key: string): void {
    library.query = ''
    library.openArtist(key)
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

  const v = virtualList(
    () => ({ count: rows.length, scrollEl, list, size: estimate, remeasure: true }),
    3
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

  // the artists of the song playing: its album's and its own
  const playing = $derived(
    new Set(
      queue.current && queue.currentAlbum
        ? [...namesOf(queue.currentAlbum), ...namesOf(queue.current)].map(artistKey)
        : []
    )
  )

  function edit(a: Artist): void {
    onopen(a.key)
    library.editingArtist = a.key
  }

  const album = (id: string): { cover: string; trackIds: string[] } => library.album(id)
  const songCover = (id: string): string => library.art(library.track(id)).cover
  const plural = (n: number, one: string, many: string): string =>
    `${n.toLocaleString()} ${n === 1 ? one : many}`
  // albums, or songs for an artist with only songs on other albums
  const count = (a: Artist): string =>
    a.albums.length
      ? plural(a.albums.length, 'album', 'albums')
      : plural(a.also.length, 'song', 'songs')
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
      class="row"
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
              sections(songMenu(artistSongs(a, album), { from: a.name }), [
                { label: 'Edit artist', run: () => edit(a) }
              ])
            )}
        >
          <div class="picwrap">
            <button class="pic" aria-label="Open {a.name}" onclick={() => onopen(a.key)}
              ><ArtistPic
                photo={library.photos[a.key]?.cover}
                covers={artistCovers(a, album, songCover)}
              /></button
            >
            <button
              class="qp"
              aria-label="Play {a.name}"
              onclick={() => queue.playList(artistSongs(a, album), 0, a.name)}
            >
              <Icon name="play" />
            </button>
          </div>
          <div class="t">
            {#if playing.has(a.key)}<Eq />{/if}<span>{a.name}</span>
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
  .row {
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
  .t {
    font-size: 14px;
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
    font-size: 13px;
    color: var(--ink-3);
    margin-top: -5px;
  }
</style>
