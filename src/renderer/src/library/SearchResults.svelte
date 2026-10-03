<!-- What a search finds in the library (ticket 039): songs, albums and
     artists, then songs in Music For Programming mixes (ticket 052), each
     group cut short with "Show all". Shown in the Albums view
     while the search box has text, over the grid or the open album. -->
<script lang="ts">
  import AlbumGrid from './AlbumGrid.svelte'
  import ArtistGrid from './ArtistGrid.svelte'
  import Empty from './Empty.svelte'
  import SongTable from './SongTable.svelte'
  import Eq from '../ui/Eq.svelte'
  import Icon from '../ui/Icon.svelte'
  import Thumb from '../ui/Thumb.svelte'
  import { fmtTime } from '../format'
  import { roving } from '../ui/roving'
  import { filterArtists } from './artists'
  import { filterAlbums, searchSongs } from './views'
  import { library, type SearchGroup } from '../stores/library.svelte'
  import { playing } from '../stores/playing.svelte'
  import { queue } from '../stores/queue.svelte'
  import { openSongMenu } from './song-menu'
  import type { Track } from '../../../shared/library'
  import { isPlaying, trackKey } from '../plugins/files/views'

  let {
    scrollEl,
    onartist
  }: {
    scrollEl: HTMLElement | undefined
    // opens the artist's page in this template's Artists view
    onartist: (key: string) => void
  } = $props()

  const TOP_SONGS = 8
  // 2, 3, 4 or 6 columns fill their rows
  const TOP_TILES = 12

  const q = $derived(library.query.trim())
  const songs = $derived(searchSongs(library.albums, (id) => library.track(id), q))
  const songKeys = $derived(songs.map(trackKey))
  const albums = $derived(filterAlbums(library.albums, q))
  const artists = $derived(filterArtists(library.artists, q))
  // none while the setting is off: there are no episodes then
  const mixes = $derived(searchSongs(library.mfpAlbums, (id) => library.track(id), q))
  const mixKeys = $derived(mixes.map(trackKey))
  const from = $derived(`search "${q}"`)
  const titles: Record<SearchGroup, string> = {
    songs: 'Songs',
    albums: 'Albums',
    artists: 'Artists',
    mfp: 'In MFP mixes'
  }

  // the clicked song, with every song of its group found after it as the queue
  function play(rows: Track[], i: number): void {
    queue.playList(rows.map(trackKey), i, from)
  }

  function openAlbum(id: string): void {
    library.openAlbum(id)
  }
</script>

{#snippet more(group: SearchGroup, n: number, top: number)}
  <div class="grouphead">
    <h3 class="part section-label">{titles[group]}</h3>
    {#if n > top}
      <button class="more" onclick={() => library.showAll(group)}>Show all {n}</button>
    {/if}
  </div>
{/snippet}

{#snippet songList(group: SearchGroup, rows: Track[])}
  <section class="songs">
    {@render more(group, rows.length, TOP_SONGS)}
    <div class="lines" use:roving={{ rows }}>
      {#each rows.slice(0, TOP_SONGS) as t, i (t.id)}
        {@const cur = isPlaying(t)}
        <button
          class="srow row"
          class:cur-row={cur}
          data-row
          aria-current={cur ? 'true' : undefined}
          onclick={() => play(rows, i)}
          oncontextmenu={(e) => openSongMenu(e, [trackKey(t)], { from })}
        >
          <span class="tt">
            <Thumb src={library.art(t).cover} size={36} radius={4} />
            <span class="nm"
              >{#if cur && playing.songPlaying}<Eq />{/if}<span title={t.title}>{t.title}</span
              ></span
            >
          </span>
          <span class="o" title={t.artist}>{t.artist}</span>
          <span class="o al" title={t.album}>{t.album}</span>
          <span class="d">{fmtTime(t.duration)}</span>
        </button>
      {/each}
    </div>
  </section>
{/snippet}

{#if library.searchAll}
  <button class="back" onclick={() => library.showAll(null)}
    ><Icon name="back" size={16} />All results</button
  >
  {#if library.searchAll === 'songs'}
    <SongTable title="Songs" meta={`Search "${q}"`} items={songKeys} {scrollEl} />
  {:else if library.searchAll === 'mfp'}
    <SongTable title={titles.mfp} meta={`Search "${q}"`} items={mixKeys} {scrollEl} />
  {:else}
    <div class="allhead">
      <div class="page-meta">Search "{q}"</div>
      <h2 class="page-title">{titles[library.searchAll]}</h2>
    </div>
    {#if library.searchAll === 'albums'}
      <AlbumGrid {scrollEl} items={albums} onopen={openAlbum} />
    {:else}
      <ArtistGrid {scrollEl} items={artists} onopen={onartist} />
    {/if}
  {/if}
{:else if !songs.length && !albums.length && !artists.length && !mixes.length}
  <Empty title="No matches" text="No song, album or artist has that in its name." />
{:else}
  {#if songs.length}
    {@render songList('songs', songs)}
  {/if}
  {#if albums.length}
    <section>
      {@render more('albums', albums.length, TOP_TILES)}
      <AlbumGrid {scrollEl} items={albums.slice(0, TOP_TILES)} onopen={openAlbum} />
    </section>
  {/if}
  {#if artists.length}
    <section>
      {@render more('artists', artists.length, TOP_TILES)}
      <ArtistGrid {scrollEl} items={artists.slice(0, TOP_TILES)} onopen={onartist} />
    </section>
  {/if}
  {#if mixes.length}
    {@render songList('mfp', mixes)}
  {/if}
{/if}

<style>
  section + section {
    margin-top: 14px;
  }
  .grouphead {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }
  .part {
    margin: 0;
  }
  .more {
    font-size: var(--text-s);
    color: var(--ink-2);
    padding: 4px 8px;
    margin-right: -8px;
    border-radius: 6px;
  }
  .more:hover {
    color: var(--ink);
    background: var(--hover);
  }
  .back {
    font-size: var(--text-s);
    color: var(--ink-3);
    display: inline-flex;
    gap: 4px;
    align-items: center;
    margin: 4px 0 12px;
  }
  .back:hover {
    color: var(--ink);
  }
  .allhead {
    padding-bottom: 16px;
  }
  /* the song table's rows, with no number column */
  .srow {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1.3fr) minmax(0, 1.3fr) 56px;
    gap: 16px;
    align-items: center;
    width: 100%;
    height: 54px;
    padding: 0 12px;
    font-size: var(--text-l);
  }
  /* a narrow list drops the album; the album group is below */
  .songs {
    container-type: inline-size;
  }
  @container (max-width: 520px) {
    .srow {
      grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr) 44px;
    }
    .al {
      display: none;
    }
  }
  .srow > span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tt {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--ink);
  }
  .nm {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .nm span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cur-row .nm {
    font-weight: 600;
  }
  .o {
    color: var(--ink-2);
  }
  .d {
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
    font-size: var(--text-m);
    text-align: right;
  }
</style>
