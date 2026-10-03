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
  import { fmtCount } from '../format'
  import Icon from '../ui/Icon.svelte'
  import type { IconName } from '../ui/icons'
  import { folderSearchText } from './folders'
  import { libraryOnScreen } from './side-buttons'
  import { libraryView, scrollTopOnChange } from '../ui/scroll-top.svelte'
  import { songRows } from './views'
  import { library, type Section } from '../stores/library.svelte'
  import { playlists } from '../stores/playlists.svelte'
  import { settings } from '../stores/settings.svelte'

  const allSections: [Section, IconName, string][] = [
    ['songs', 'note', 'Songs'],
    ['albums', 'disc', 'Albums'],
    ['artists', 'person', 'Artists'],
    ['folders', 'folder', 'Folders'],
    ['radio', 'radio', 'Radio'],
    ['mfp', 'viz', 'MFP']
  ]
  // MFP only while its setting is on (ticket 052)
  const sections = $derived(allSections.filter(([s]) => s !== 'mfp' || settings.mfp))

  let scrollEl: HTMLDivElement | undefined = $state()

  const playlist = $derived(
    library.section.startsWith('pl:') ? playlists.get(library.section.slice(3)) : undefined
  )

  const songs = $derived(songRows(library.albums, (id) => library.track(id), library.query))

  const searching = $derived(!!library.query.trim())

  function pick(s: Section): void {
    library.pickSection(s)
  }

  // from the search results: one step to the artist's page
  function openArtist(key: string): void {
    library.showArtist(key)
  }

  const placeholders: Partial<Record<Section, string>> = {
    songs: 'Search songs',
    albums: 'Search library',
    artists: 'Search artists',
    folders: 'Search folders',
    radio: 'Search stations',
    mfp: 'Search mixes'
  }

  function create(): void {
    const id = playlists.create()
    pick(`pl:${id}`)
    playlists.editing = id
  }

  scrollTopOnChange(
    () => scrollEl,
    () => libraryView(library.section)
  )

  libraryOnScreen()
</script>

{#snippet item(sec: Section, icon: IconName, label: string)}
  <button class="sidebtn" aria-current={library.section === sec} onclick={() => pick(sec)}>
    <Icon name={icon} size={18} /><span
      class="lbl"
      title={sec.startsWith('pl:') ? label : undefined}>{label}</span
    >
  </button>
{/snippet}

<div class="lib2" data-notice-host>
  <aside class="side">
    <div class="search">
      <SearchBox
        placeholder={library.section === 'folders'
          ? folderSearchText(library.folders, library.folder)
          : (placeholders[library.section] ?? 'Search this playlist')}
      />
    </div>
    <div class="sidehead section-label">Library <HistoryButtons size={26} /></div>
    {#each sections as [sec, icon, label] (sec)}
      {@render item(sec, icon, label)}
    {/each}
    <div class="sidehead section-label">
      Playlists
      <button class="add" aria-label="New playlist" title="New playlist" onclick={create}
        ><Icon name="plus" size={16} /></button
      >
    </div>
    {#each playlists.list as p (p.id)}
      {@render item(`pl:${p.id}`, 'list', p.name)}
    {/each}
    <div class="foot"><ScanLine wrap /></div>
  </aside>
  <div class="main" bind:this={scrollEl}>
    {#if library.section === 'radio'}
      <RadioView searchAt="left" />
    {:else if library.section === 'mfp'}
      <MfpView />
    {:else if !library.albums.length}
      <!-- radio and MFP need no songs, so the sidebar stays -->
      <div class="fill"><NoLibrary /></div>
    {:else if library.section === 'songs'}
      <SongTable title="Songs" meta="Library" items={songs} {scrollEl} />
    {:else if library.section === 'albums'}
      {#if searching}
        <SearchResults {scrollEl} onartist={openArtist} />
      {:else if library.open}
        <AlbumPage albumId={library.open} />
      {:else}
        <ViewHead title="Albums" count={fmtCount(library.albums.length, 'album', 'albums')} />
        <AlbumGrid {scrollEl} />
      {/if}
    {:else if playlist}
      <PlaylistView id={playlist.id} {scrollEl} />
    {:else if library.section === 'folders'}
      <FolderView {scrollEl} />
    {:else if library.section === 'artists'}
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
