<!-- Classic's library: a sidebar with sections and playlists, a table or grid beside it. -->
<script lang="ts">
  import AlbumGrid from './AlbumGrid.svelte'
  import AlbumPage from './AlbumPage.svelte'
  import Empty from './Empty.svelte'
  import SearchBox from './SearchBox.svelte'
  import SongTable from './SongTable.svelte'
  import Icon from '../ui/Icon.svelte'
  import type { IconName } from '../ui/icons'
  import { placeholders } from './placeholders'
  import { songRows } from './views'
  import { library, type Section } from '../stores/library.svelte'

  const sections: [Section, IconName, string][] = [
    ['songs', 'note', 'Songs'],
    ['albums', 'disc', 'Albums'],
    ['artists', 'person', 'Artists'],
    ['folders', 'folder', 'Folders']
  ]

  let scrollEl: HTMLDivElement | undefined = $state()

  const playlist = $derived(
    library.section.startsWith('pl:')
      ? library.playlists.find((p) => 'pl:' + p.id === library.section)
      : undefined
  )

  const songs = $derived(songRows(library.albums, (id) => library.track(id), library.query))

  function pick(s: Section): void {
    library.section = s
    library.open = null
  }

  // a new view starts at the top
  $effect(() => {
    void library.open
    void library.section
    if (scrollEl) scrollEl.scrollTop = 0
  })
</script>

{#snippet item(sec: Section, icon: IconName, label: string)}
  <button class="sidebtn" aria-current={library.section === sec} onclick={() => pick(sec)}>
    <Icon name={icon} size={18} />{label}
  </button>
{/snippet}

<div class="lib2">
  <aside class="side">
    <div class="search"><SearchBox placeholder="Search" /></div>
    <div class="sidehead">Library</div>
    {#each sections as [sec, icon, label] (sec)}
      {@render item(sec, icon, label)}
    {/each}
    <div class="sidehead">Playlists</div>
    {#each library.playlists as p (p.id)}
      {@render item(`pl:${p.id}`, 'list', p.name)}
    {/each}
  </aside>
  <div class="main" bind:this={scrollEl}>
    {#if library.section === 'songs'}
      <SongTable title="Songs" meta="Library" items={songs} {scrollEl} />
    {:else if library.section === 'albums'}
      {#if library.open}
        <AlbumPage albumId={library.open} />
      {:else}
        <AlbumGrid {scrollEl} />
      {/if}
    {:else if playlist}
      <SongTable
        title={playlist.name}
        meta="Playlist"
        items={playlist.trackIds.map((id) => library.track(id))}
        {scrollEl}
      />
    {:else if library.section === 'artists' || library.section === 'folders'}
      <Empty title={placeholders[library.section][0]} text={placeholders[library.section][1]} />
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
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-3);
    font-weight: 600;
    padding: 14px 10px 6px;
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
  .main {
    flex: 1;
    overflow: auto;
    padding: 20px 24px 24px;
    min-width: 0;
    position: relative;
  }
</style>
