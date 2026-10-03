<!-- Classic's library: a sidebar with sections and playlists, a table or grid beside it. -->
<script lang="ts">
  import AlbumGrid from './AlbumGrid.svelte'
  import AlbumPage from './AlbumPage.svelte'
  import ArtistView from './ArtistView.svelte'
  import FolderView from './FolderView.svelte'
  import MfpView from './MfpView.svelte'
  import HistoryButtons from './HistoryButtons.svelte'
  import NoLibrary from './NoLibrary.svelte'
  import PlaylistView from './PlaylistView.svelte'
  import RadioView from './RadioView.svelte'
  import ScanLine from './ScanLine.svelte'
  import SearchBox from './SearchBox.svelte'
  import SearchResults from './SearchResults.svelte'
  import SongTable from './SongTable.svelte'
  import ViewHead from './ViewHead.svelte'
  import NoPlugins from './NoPlugins.svelte'
  import { untrack } from 'svelte'
  import { fmtCount } from '../format'
  import Icon from '../ui/Icon.svelte'
  import type { IconName } from '../ui/icons'
  import { libraryOnScreen } from './side-buttons'
  import { libraryView, scrollTopOnChange } from '../ui/scroll-top.svelte'
  import { songRows } from './views'
  import { library, playlistPage, playlistsTab } from '../stores/library.svelte'
  import { playlists } from '../stores/playlists.svelte'
  import { pluginTabs } from '../plugins'
  import { tabsIn } from '../plugins/tabs'
  import { trackKey } from '../plugins/files/views'
  import { shownAlbum, showArtist } from '../plugins/files/nav'

  // the tabs of the plugins that are on (ticket 059); playlists are listed
  // under their own heading
  const tabs = $derived(tabsIn(pluginTabs(), 'sidebar'))
  const sections = $derived(tabs.filter((t) => t.id !== playlistsTab))
  const hasPlaylists = $derived(tabs.some((t) => t.id === playlistsTab))
  const shown = $derived(tabs.find((t) => t.id === library.tab))
  const open = $derived(shownAlbum())
  // untracked: a write while this block is drawn
  untrack(() => library.showIn('sidebar'))

  let scrollEl: HTMLDivElement | undefined = $state()

  const playlist = $derived(
    library.tab === playlistsTab && library.openPlaylist
      ? playlists.get(library.openPlaylist)
      : undefined
  )

  const songs = $derived(
    songRows(library.albums, (id) => library.track(id), library.query).map(trackKey)
  )

  const searching = $derived(!!library.query.trim())

  const pickPlaylist = (id: string): void => library.pickTab(playlistsTab, playlistPage(id))

  function create(): void {
    const id = playlists.create()
    pickPlaylist(id)
    playlists.editing = id
  }

  scrollTopOnChange(
    () => scrollEl,
    () => libraryView()
  )

  libraryOnScreen()
</script>

{#snippet item(current: boolean, pick: () => void, icon: IconName, label: string, full = false)}
  <button class="sidebtn" aria-current={current} onclick={pick}>
    <Icon name={icon} size={18} /><span class="lbl" title={full ? label : undefined}>{label}</span>
  </button>
{/snippet}

<div class="lib2" data-notice-host>
  <aside class="side">
    <div class="search">
      <SearchBox placeholder={shown?.searchShort ?? shown?.search ?? 'Search'} />
    </div>
    <div class="sidehead section-label">Library <HistoryButtons size={26} /></div>
    {#each sections as t (t.id)}
      {@render item(library.tab === t.id, () => library.pickTab(t.id), t.icon, t.label)}
    {/each}
    {#if hasPlaylists}
      <div class="sidehead section-label">
        Playlists
        <button class="add" aria-label="New playlist" title="New playlist" onclick={create}
          ><Icon name="plus" size={16} /></button
        >
      </div>
      {#each playlists.list as p (p.id)}
        {@render item(playlist?.id === p.id, () => pickPlaylist(p.id), 'list', p.name, true)}
      {/each}
    {/if}
    <div class="foot"><ScanLine wrap /></div>
  </aside>
  <div class="main" bind:this={scrollEl}>
    {#if !tabs.length}
      <div class="fill"><NoPlugins /></div>
    {:else if shown?.plugin === 'radio'}
      <RadioView searchAt="left" />
    {:else if shown?.plugin === 'mfp'}
      <MfpView />
    {:else if !library.albums.length}
      <!-- radio and MFP need no songs, so the sidebar stays -->
      <div class="fill"><NoLibrary /></div>
    {:else if shown?.id === 'songs'}
      <SongTable title="Songs" meta="Library" items={songs} {scrollEl} />
    {:else if shown?.id === 'albums'}
      {#if searching}
        <SearchResults {scrollEl} onartist={showArtist} />
      {:else if open}
        <AlbumPage albumId={open} />
      {:else}
        <ViewHead title="Albums" count={fmtCount(library.albums.length, 'album', 'albums')} />
        <AlbumGrid {scrollEl} />
      {/if}
    {:else if playlist}
      <PlaylistView id={playlist.id} {scrollEl} />
    {:else if shown?.id === 'folders'}
      <FolderView {scrollEl} />
    {:else if shown?.id === 'artists'}
      <ArtistView {scrollEl} />
    {/if}
  </div>
</div>

<style>
  .lib2 {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  .side {
    width: 210px;
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px 12px;
    background: var(--bg-side);
    border-right: 1px solid var(--edge);
    overflow: auto;
  }
  .search {
    margin: 0 4px 10px;
  }
  /* Room for two lines is always kept, so the list never moves when a scan
     starts or ends, even scrolled to the bottom. While it runs, the line
     stays in view below a long list of playlists. */
  .foot {
    flex: none;
    height: 54px;
    margin: auto -12px 0;
    padding: 10px 22px 0;
  }
  .foot:has(:global(.scan)) {
    position: sticky;
    bottom: 0;
    background: var(--bg-side);
  }
  .sidehead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 10px 6px;
  }
  /* the arrows sit in the label's row without making it taller */
  .sidehead > :global(.hist) {
    margin: -6px -6px -6px 0;
  }
  .add {
    width: 24px;
    height: 24px;
    margin: -4px -4px -4px 0;
    display: grid;
    place-items: center;
    border-radius: 6px;
    color: var(--ink-3);
  }
  .add:hover {
    background: var(--hover);
    color: var(--ink);
  }
  .sidebtn {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    padding: 9px 10px;
    border-radius: 8px;
    font-size: var(--text-m);
    color: var(--ink-2);
    flex: none;
  }
  .lbl {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sidebtn :global(.ico) {
    opacity: 0.8;
  }
  .sidebtn:hover {
    background: var(--hover);
    color: var(--ink);
  }
  .sidebtn:active {
    background: var(--active);
  }
  .sidebtn[aria-current='true'] {
    background: var(--active);
    color: var(--ink);
    font-weight: 600;
  }
  .fill {
    min-height: 100%;
    display: flex;
    flex-direction: column;
  }
  .main {
    flex: 1;
    overflow: auto;
    /* grid sizes follow the width; a scrollbar that comes and goes would make them loop */
    scrollbar-gutter: stable;
    padding: 20px 24px 24px;
    min-width: 0;
    position: relative;
  }
</style>
