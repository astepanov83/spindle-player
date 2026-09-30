<!-- Classic's library: a sidebar with sections and playlists, a table or grid beside it. -->
<script lang="ts">
  import AlbumGrid from './AlbumGrid.svelte'
  import AlbumPage from './AlbumPage.svelte'
  import ArtistView from './ArtistView.svelte'
  import FolderView from './FolderView.svelte'
  import NoLibrary from './NoLibrary.svelte'
  import PlaylistView from './PlaylistView.svelte'
  import RadioView from './RadioView.svelte'
  import SearchBox from './SearchBox.svelte'
  import SongTable from './SongTable.svelte'
  import Icon from '../ui/Icon.svelte'
  import type { IconName } from '../ui/icons'
  import { onSideButton } from './side-buttons'
  import { libraryView, scrollTopOnChange } from '../ui/scroll-top.svelte'
  import { songRows } from './views'
  import { library, type Page, type Section } from '../stores/library.svelte'
  import { playlists } from '../stores/playlists.svelte'

  const sections: [Section, IconName, string][] = [
    ['songs', 'note', 'Songs'],
    ['albums', 'disc', 'Albums'],
    ['artists', 'person', 'Artists'],
    ['folders', 'folder', 'Folders'],
    ['radio', 'radio', 'Radio']
  ]

  let scrollEl: HTMLDivElement | undefined = $state()

  const playlist = $derived(
    library.section.startsWith('pl:') ? playlists.get(library.section.slice(3)) : undefined
  )

  const songs = $derived(songRows(library.albums, (id) => library.track(id), library.query))

  function pick(s: Section): void {
    library.section = s
    library.open = null
    library.artist = null
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

  const pages: Partial<Record<Section, Page>> = {
    albums: 'open',
    folders: 'folder',
    artists: 'artist'
  }
</script>

<svelte:window onmouseup={(e) => onSideButton(e, pages[library.section] ?? null)} />

{#snippet item(sec: Section, icon: IconName, label: string)}
  <button class="sidebtn" aria-current={library.section === sec} onclick={() => pick(sec)}>
    <Icon name={icon} size={18} /><span class="lbl">{label}</span>
  </button>
{/snippet}

<div class="lib2">
  <aside class="side">
    <div class="search"><SearchBox placeholder="Search" /></div>
    <div class="sidehead">Library</div>
    {#each sections as [sec, icon, label] (sec)}
      {@render item(sec, icon, label)}
    {/each}
    <div class="sidehead">
      Playlists
      <button class="add" aria-label="New playlist" title="New playlist" onclick={create}
        ><Icon name="plus" size={16} /></button
      >
    </div>
    {#each playlists.list as p (p.id)}
      {@render item(`pl:${p.id}`, 'list', p.name)}
    {/each}
  </aside>
  <div class="main" bind:this={scrollEl}>
    {#if library.section === 'radio'}
      <RadioView />
    {:else if !library.albums.length}
      <!-- radio needs no songs, so the sidebar stays -->
      <div class="fill"><NoLibrary /></div>
    {:else if library.section === 'songs'}
      <SongTable title="Songs" meta="Library" items={songs} {scrollEl} />
    {:else if library.section === 'albums'}
      {#if library.open}
        <AlbumPage albumId={library.open} />
      {:else}
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
  .sidehead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-3);
    font-weight: 600;
    padding: 14px 10px 6px;
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
    font-size: 14px;
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
