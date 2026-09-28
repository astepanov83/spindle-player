<!-- The Artists view (ticket 021): the grid, an artist's page, or an album
     opened from it. -->
<script lang="ts">
  import AlbumPage from './AlbumPage.svelte'
  import ArtistGrid from './ArtistGrid.svelte'
  import ArtistPage from './ArtistPage.svelte'
  import { library } from '../stores/library.svelte'

  let { scrollEl }: { scrollEl: HTMLElement | undefined } = $props()

  const artist = $derived(library.artist ? library.getArtist(library.artist) : undefined)
</script>

{#if library.open}
  <AlbumPage albumId={library.open} back={artist?.name ?? 'All artists'} />
{:else if artist}
  <ArtistPage {artist} {scrollEl} />
{:else}
  <ArtistGrid {scrollEl} />
{/if}
