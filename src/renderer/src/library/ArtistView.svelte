<!-- The Artists view (ticket 021): the grid, an artist's page, or an album
     opened from it. -->
<script lang="ts">
  import AlbumPage from './AlbumPage.svelte'
  import ArtistGrid from './ArtistGrid.svelte'
  import ArtistPage from './ArtistPage.svelte'
  import ViewHead from './ViewHead.svelte'
  import { fmtCount } from '../format'
  import { filterArtists } from './artists'
  import { library } from '../stores/library.svelte'
  import { openArtistAlbum, shownArtist } from '../plugins/files/nav'

  let { scrollEl }: { scrollEl: HTMLElement | undefined } = $props()

  const open = $derived(shownArtist())
  const artist = $derived(open.key ? library.getArtist(open.key) : undefined)
  // what the grid shows: a search filters it
  const shown = $derived(
    library.query.trim()
      ? filterArtists(library.artists, library.query).length
      : library.artists.length
  )
</script>

<!-- while searching, the grid shows over the open page, which comes back
     when the text is cleared -->
{#snippet grid()}
  <ViewHead title="Artists" count={fmtCount(shown, 'artist', 'artists')} />
  <ArtistGrid {scrollEl} />
{/snippet}

{#if library.query.trim()}
  {@render grid()}
{:else if open.album}
  <AlbumPage
    albumId={open.album}
    back={artist?.name ?? 'All artists'}
    onback={() => openArtistAlbum(null)}
  />
{:else if artist}
  <ArtistPage {artist} {scrollEl} />
{:else}
  {@render grid()}
{/if}
