<!-- An artist: their picture and name, their albums as covers, then their
     songs on other albums in the song table. -->
<script lang="ts">
  import type { Artist } from '../../../shared/artists'
  import AlbumGrid from './AlbumGrid.svelte'
  import ArtistPic from './ArtistPic.svelte'
  import SongTable from './SongTable.svelte'
  import Icon from '../ui/Icon.svelte'
  import { artistCovers, artistSongs } from './artists'
  import { openSongMenu } from './song-menu'
  import { library } from '../stores/library.svelte'
  import { player } from '../stores/player.svelte'
  import { queue } from '../stores/queue.svelte'

  let { artist: a, scrollEl }: { artist: Artist; scrollEl: HTMLElement | undefined } = $props()

  const album = (id: string): { cover: string; trackIds: string[] } => library.album(id)
  const albums = $derived(a.albums.map((id) => library.album(id)))
  const also = $derived(a.also.map((id) => library.track(id)))
  const songs = $derived(artistSongs(a, album))
  const covers = $derived(artistCovers(a, album, (id) => library.art(library.track(id)).cover))
  const plural = (n: number, one: string, many: string): string =>
    `${n.toLocaleString()} ${n === 1 ? one : many}`

  // their albums in order, then the "Also on" songs
  function play(shuffle: boolean): void {
    if (!songs.length) return
    if (shuffle) player.shuffle = true
    queue.playList(songs, shuffle ? Math.floor(Math.random() * songs.length) : 0, a.name)
  }
</script>

<button class="back" onclick={() => library.openArtist(null)}
  ><Icon name="back" size={16} />All artists</button
>
<div class="head">
  <div class="pic"><ArtistPic photo={library.photos[a.key]?.coverLarge} {covers} /></div>
  <div class="about">
    <div class="page-meta">Artist</div>
    <h2 class="page-title">{a.name}</h2>
    <div class="page-meta">
      {[
        albums.length ? plural(albums.length, 'album', 'albums') : '',
        plural(songs.length, 'song', 'songs')
      ]
        .filter(Boolean)
        .join(' · ')}
    </div>
    <div class="acts">
      <button class="pill" onclick={() => play(false)}>Play</button>
      <button class="pill ghost" onclick={() => play(true)}>Shuffle</button>
      <button class="pill ghost" aria-haspopup="menu" onclick={(e) => openSongMenu(e, songs)}
        >Add to playlist</button
      >
    </div>
  </div>
</div>

{#if albums.length}
  <h3 class="part">Albums</h3>
  <AlbumGrid {scrollEl} items={albums} onopen={(id) => library.openArtistAlbum(id)} />
{/if}

{#if also.length}
  <SongTable
    title={a.name}
    meta="Also on"
    items={also}
    {scrollEl}
    sort={library.artistSort}
    onsort={(k) => library.sortArtist(k)}
  >
    {#snippet head()}
      <h3 class="part">Also on</h3>
    {/snippet}
  </SongTable>
{/if}

<style>
  .back {
    font-size: 13px;
    color: var(--ink-3);
    display: inline-flex;
    gap: 4px;
    align-items: center;
    margin-top: 4px;
  }
  .back:hover {
    color: var(--ink);
  }
  .head {
    display: flex;
    gap: 22px;
    align-items: flex-end;
    padding: 8px 0 22px;
    flex-wrap: wrap;
  }
  .about {
    min-width: 0;
    flex: 1 1 200px;
  }
  .head .page-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pic {
    width: 160px;
    aspect-ratio: 1;
    border-radius: 50%;
    box-shadow: 0 14px 30px -12px var(--shadow);
    flex: none;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 16px;
  }
  .pill {
    padding: 9px 18px;
    border-radius: 99px;
    font-size: 14px;
    font-weight: 600;
    background: var(--ink);
    color: var(--bg);
  }
  .pill.ghost {
    background: var(--field);
    color: var(--ink);
  }
  .part {
    margin: 0 0 14px;
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-3);
    font-weight: 600;
  }
  /* the table's own head sits on the same line as the song count */
  :global(.tblhead) .part {
    margin: 0;
  }
</style>
