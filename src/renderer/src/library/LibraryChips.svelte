<!-- Studio's library: search and chips on top, cover grid below. -->
<script lang="ts">
  import AlbumGrid from './AlbumGrid.svelte'
  import AlbumPage from './AlbumPage.svelte'
  import ArtistView from './ArtistView.svelte'
  import FolderView from './FolderView.svelte'
  import NoLibrary from './NoLibrary.svelte'
  import PlaylistList from './PlaylistList.svelte'
  import PlaylistView from './PlaylistView.svelte'
  import RadioView from './RadioView.svelte'
  import ScanLine from './ScanLine.svelte'
  import SearchBox from './SearchBox.svelte'
  import SearchResults from './SearchResults.svelte'
  import ViewHead from './ViewHead.svelte'
  import { fmtCount } from '../format'
  import { folderSearchText } from './folders'
  import { showPage } from './side-buttons'
  import { libraryView, scrollTopOnChange } from '../ui/scroll-top.svelte'
  import { library, type Chip, type Page } from '../stores/library.svelte'

  const chips: [Chip, string][] = [
    ['albums', 'Albums'],
    ['artists', 'Artists'],
    ['folders', 'Folders'],
    ['playlists', 'Playlists'],
    ['radio', 'Radio']
  ]

  let scrollEl: HTMLDivElement | undefined = $state()

  const searching = $derived(!!library.query.trim())

  function pick(c: Chip): void {
    library.pickChip(c)
  }

  function openArtist(key: string): void {
    pick('artists')
    library.openArtist(key)
  }

  const placeholders: Record<Chip, string> = {
    albums: 'Search your library',
    artists: 'Search artists',
    folders: 'Search folders',
    playlists: 'Search playlists',
    radio: 'Search stations'
  }

  const pages: Partial<Record<Chip, Page>> = {
    albums: 'open',
    playlists: 'openPlaylist',
    folders: 'folder',
    artists: 'artist'
  }
  // Back and Forward leave the page under the search results alone
  const page: Page | null = $derived(
    searching && (library.chip === 'albums' || library.chip === 'artists')
      ? null
      : (pages[library.chip] ?? null)
  )

  showPage(() => page)

  scrollTopOnChange(
    () => scrollEl,
    () => libraryView(library.chip)
  )
</script>

<div class="lib" data-notice-host>
  <div class="top">
    <SearchBox
      placeholder={library.chip === 'playlists' && library.openPlaylist
        ? 'Search this playlist'
        : library.chip === 'folders'
          ? folderSearchText(library.folders, library.folder)
          : placeholders[library.chip]}
    />
    <!-- the scan line takes the row's spare room, so the grid never moves -->
    <div class="chiprow">
      <div class="chips">
        {#each chips as [c, label] (c)}
          <button class="chip" aria-pressed={library.chip === c} onclick={() => pick(c)}
            >{label}</button
          >
        {/each}
      </div>
      <ScanLine />
    </div>
  </div>
  <div class="scroll" bind:this={scrollEl}>
    {#if library.chip === 'radio'}
      <RadioView searchAt="above" />
    {:else if !library.albums.length}
      <!-- radio needs no songs, so the chips stay -->
      <div class="fill">
        <NoLibrary view={library.chip === 'playlists' ? 'playlists' : undefined} />
      </div>
    {:else if library.chip === 'playlists'}
      {#if library.openPlaylist}
        <PlaylistView id={library.openPlaylist} {scrollEl} back />
      {:else}
        <PlaylistList />
      {/if}
    {:else if library.chip === 'folders'}
      <FolderView {scrollEl} />
    {:else if library.chip === 'artists'}
      <ArtistView {scrollEl} />
    {:else if searching}
      <SearchResults {scrollEl} onartist={openArtist} />
    {:else if library.open}
      <AlbumPage albumId={library.open} />
    {:else}
      <ViewHead title="Albums" count={fmtCount(library.albums.length, 'album', 'albums')} />
      <AlbumGrid {scrollEl} />
    {/if}
  </div>
</div>

<style>
  .lib {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .top {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 22px 12px;
  }
  .chiprow {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }
  .chiprow > :global(.scan) {
    flex: 1 1 0;
  }
  .chips {
    flex: none;
    display: flex;
    gap: 6px;
  }
  .fill {
    min-height: 100%;
    display: flex;
    flex-direction: column;
  }
  .scroll {
    --scroll-pad-top: 4px;
    flex: 1;
    overflow: auto;
    /* grid sizes follow the width; a scrollbar that comes and goes would make them loop */
    scrollbar-gutter: stable;
    padding: 4px 22px 22px;
    min-height: 0;
    position: relative;
  }
</style>
