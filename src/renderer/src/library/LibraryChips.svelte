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
  import SearchBox from './SearchBox.svelte'
  import { onSideButton } from './side-buttons'
  import { scrollTopOnChange } from '../ui/scroll-top.svelte'
  import { library, type Chip, type Page } from '../stores/library.svelte'

  const chips: [Chip, string][] = [
    ['albums', 'Albums'],
    ['artists', 'Artists'],
    ['folders', 'Folders'],
    ['playlists', 'Playlists'],
    ['radio', 'Radio']
  ]

  let scrollEl: HTMLDivElement | undefined = $state()

  function pick(c: Chip): void {
    library.chip = c
    library.open = null
    library.openPlaylist = null
    library.artist = null
  }

  const pages: Partial<Record<Chip, Page>> = {
    albums: 'open',
    playlists: 'openPlaylist',
    folders: 'folder',
    artists: 'artist'
  }
  const page: Page | null = $derived(pages[library.chip] ?? null)

  scrollTopOnChange(
    () => scrollEl,
    () => [library.open, library.openPlaylist, library.chip, library.folder, library.artist]
  )
</script>

<svelte:window onmouseup={(e) => onSideButton(e, page)} />

<div class="lib">
  <div class="top">
    <SearchBox
      placeholder={library.chip === 'folders'
        ? 'Search this folder'
        : library.chip === 'artists'
          ? 'Search artists'
          : library.chip === 'radio'
            ? 'Search stations'
            : 'Search albums and artists'}
    />
    <div class="chips">
      {#each chips as [c, label] (c)}
        <button class="chip" aria-pressed={library.chip === c} onclick={() => pick(c)}
          >{label}</button
        >
      {/each}
    </div>
  </div>
  <div class="scroll" bind:this={scrollEl}>
    {#if library.chip === 'radio'}
      <RadioView />
    {:else if !library.albums.length}
      <!-- radio needs no songs, so the chips stay -->
      <div class="fill"><NoLibrary /></div>
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
    {:else if library.open}
      <AlbumPage albumId={library.open} />
    {:else}
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
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    font-size: 13px;
    padding: 6px 12px;
    border-radius: 99px;
    background: var(--field);
    color: var(--ink-2);
  }
  .chip[aria-pressed='true'] {
    background: var(--ink);
    color: var(--bg);
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
