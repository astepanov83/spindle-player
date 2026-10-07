<!-- Classic's library: a sidebar with sections and playlists, a table or grid beside it. -->
<script lang="ts">
  import BlockPage from '../blocks/BlockPage.svelte'
  import Nothing from '../blocks/Nothing.svelte'
  import HistoryButtons from './HistoryButtons.svelte'
  import PlaylistView from './PlaylistView.svelte'
  import ScanLine from './ScanLine.svelte'
  import SearchBox from './SearchBox.svelte'
  import NoPlugins from './NoPlugins.svelte'
  import { untrack } from 'svelte'
  import Icon from '../ui/Icon.svelte'
  import type { IconName } from '../ui/icons'
  import { libraryOnScreen } from './side-buttons'
  import { libraryView, scrollTopOnChange } from '../ui/scroll-top.svelte'
  import { library, playlistPage, playlistsTab } from '../stores/library.svelte'
  import { playlists } from '../stores/playlists.svelte'
  import { pageBlocks, playlistsEmpty, pluginTabs, typedIn } from '../plugins'
  import { tabsIn } from '../plugins/tabs'

  // the tabs of the plugins that are on (ticket 059); playlists are listed
  // under their own heading
  const tabs = $derived(tabsIn(pluginTabs(), 'sidebar'))
  const sections = $derived(tabs.filter((t) => t.id !== playlistsTab))
  const hasPlaylists = $derived(tabs.some((t) => t.id === playlistsTab))
  const shown = $derived(tabs.find((t) => t.id === library.tab))
  // its page, from its plugin; a playlist is the core's own
  const blocks = $derived(shown ? pageBlocks(shown) : [])
  // untracked: a write while this block is drawn
  untrack(() => library.showIn('sidebar'))

  let scrollEl: HTMLDivElement | undefined = $state()

  const playlist = $derived(
    library.tab === playlistsTab && library.openPlaylist
      ? playlists.get(library.openPlaylist)
      : undefined
  )
  // no songs yet: a playlist shows that instead
  const none = $derived(shown?.plugin === 'core' ? playlistsEmpty(false) : undefined)

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
    <div class="searchrow">
      <HistoryButtons size={28} />
      <SearchBox
        placeholder={shown?.searchShort ?? shown?.search ?? 'Search'}
        onenter={() => shown && typedIn(shown.plugin, shown.id, library.query, true)}
      />
    </div>
    <div class="sidehead section-label">Library</div>
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
      {:else}
        <div class="none">No playlists yet</div>
      {/each}
    {/if}
    <div class="foot"><ScanLine wrap /></div>
  </aside>
  <div class="main" bind:this={scrollEl}>
    {#if !tabs.length}
      <div class="fill"><NoPlugins /></div>
    {:else if none}
      <div class="fill"><Nothing block={none.block} plugin={none.plugin} /></div>
    {:else if playlist}
      <PlaylistView id={playlist.id} {scrollEl} nav="sidebar" />
    {:else if shown && shown.plugin !== 'core'}
      {#key shown.id}
        <BlockPage {blocks} tab={shown.id} plugin={shown.plugin} {scrollEl} nav="sidebar" />
      {/key}
    {/if}
  </div>
</div>

<style>
  .lib2 {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  /* 236px: with Back and Forward beside it, the search box still shows
     "Search stations" whole */
  .side {
    width: 236px;
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px 12px;
    background: var(--bg-side);
    border-right: 1px solid var(--edge);
    overflow: auto;
  }
  /* Back and Forward sit left of the search box, as in Studio; they hang
     into the padding so the box keeps as much room as it can */
  .searchrow {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0 0 10px -6px;
  }
  .searchrow > :global(.search) {
    flex: 1;
    min-width: 0;
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
  .none {
    padding: 2px 10px 6px;
    font-size: var(--text-s);
    color: var(--ink-3);
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
