<!-- Studio's library: search and chips on top, cover grid below. -->
<script lang="ts">
  import AlbumGrid from './AlbumGrid.svelte'
  import AlbumPage from './AlbumPage.svelte'
  import ArtistView from './ArtistView.svelte'
  import FolderView from './FolderView.svelte'
  import MfpView from './MfpView.svelte'
  import HistoryButtons from './HistoryButtons.svelte'
  import NoLibrary from './NoLibrary.svelte'
  import PlaylistList from './PlaylistList.svelte'
  import PlaylistView from './PlaylistView.svelte'
  import RadioView from './RadioView.svelte'
  import ScanLine from './ScanLine.svelte'
  import SearchBox from './SearchBox.svelte'
  import SearchResults from './SearchResults.svelte'
  import ViewHead from './ViewHead.svelte'
  import NoPlugins from './NoPlugins.svelte'
  import { untrack } from 'svelte'
  import { fmtCount } from '../format'
  import { libraryOnScreen } from './side-buttons'
  import { libraryView, scrollTopOnChange } from '../ui/scroll-top.svelte'
  import { library } from '../stores/library.svelte'
  import { pluginTabs } from '../plugins'
  import { tabsIn } from '../plugins/tabs'
  import { shownAlbum, showArtist } from '../plugins/files/nav'

  // the tabs of the plugins that are on (ticket 059)
  const tabs = $derived(tabsIn(pluginTabs(), 'chips'))
  const shown = $derived(tabs.find((t) => t.id === library.tab))
  const open = $derived(shownAlbum())
  // untracked: a write while this block is drawn
  untrack(() => library.showIn('chips'))

  let scrollEl: HTMLDivElement | undefined = $state()

  const searching = $derived(!!library.query.trim())

  libraryOnScreen()

  scrollTopOnChange(
    () => scrollEl,
    () => libraryView()
  )
</script>

<div class="lib" data-notice-host>
  <div class="top">
    <div class="searchrow">
      <HistoryButtons />
      <SearchBox placeholder={shown?.search ?? 'Search'} />
    </div>
    <!-- the scan line takes the row's spare room, so the grid never moves -->
    <div class="chiprow">
      <div class="chips">
        {#each tabs as t (t.id)}
          <button
            class="chip"
            aria-pressed={library.tab === t.id}
            onclick={() => library.pickTab(t.id)}>{t.label}</button
          >
        {/each}
      </div>
      <ScanLine />
    </div>
  </div>
  <div class="scroll" bind:this={scrollEl}>
    {#if !tabs.length}
      <div class="fill"><NoPlugins /></div>
    {:else if shown?.plugin === 'radio'}
      <RadioView searchAt="above" />
    {:else if shown?.plugin === 'mfp'}
      <MfpView />
    {:else if !library.albums.length}
      <!-- radio and MFP need no songs, so the chips stay -->
      <div class="fill">
        <NoLibrary view={shown?.id === 'playlists' ? 'playlists' : undefined} />
      </div>
    {:else if shown?.id === 'playlists'}
      {#if library.openPlaylist}
        <PlaylistView id={library.openPlaylist} {scrollEl} back />
      {:else}
        <PlaylistList />
      {/if}
    {:else if shown?.id === 'folders'}
      <FolderView {scrollEl} />
    {:else if shown?.id === 'artists'}
      <ArtistView {scrollEl} />
    {:else if shown?.id === 'albums'}
      {#if searching}
        <SearchResults {scrollEl} onartist={showArtist} />
      {:else if open}
        <AlbumPage albumId={open} />
      {:else}
        <ViewHead title="Albums" count={fmtCount(library.albums.length, 'album', 'albums')} />
        <AlbumGrid {scrollEl} />
      {/if}
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
  .searchrow {
    display: flex;
    align-items: center;
    gap: 8px;
    /* the arrows hang left of the search box, so it lines up with the chips */
    margin-left: -6px;
  }
  .searchrow > :global(.search) {
    flex: 1;
    min-width: 0;
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
