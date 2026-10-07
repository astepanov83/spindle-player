<!-- Studio's library: search and chips on top, cover grid below. -->
<script lang="ts">
  import BlockPage from '../blocks/BlockPage.svelte'
  import Nothing from '../blocks/Nothing.svelte'
  import HistoryButtons from './HistoryButtons.svelte'
  import PlaylistList from './PlaylistList.svelte'
  import PlaylistView from './PlaylistView.svelte'
  import ScanLine from './ScanLine.svelte'
  import SearchBox from './SearchBox.svelte'
  import NoPlugins from './NoPlugins.svelte'
  import { untrack } from 'svelte'
  import { libraryOnScreen } from './side-buttons'
  import { libraryView, scrollTopOnChange } from '../ui/scroll-top.svelte'
  import { library, playlistsTab } from '../stores/library.svelte'
  import { playlists } from '../stores/playlists.svelte'
  import { pageBlocks, playlistsEmpty, pluginTabs, typedIn } from '../plugins'
  import { tabsIn } from '../plugins/tabs'
  import { menu } from '../stores/menu.svelte'
  import { playlistMenu } from './song-menu'
  import { dropTarget, type DropTarget } from '../stores/song-drag.svelte'

  // the tabs of the plugins that are on (ticket 059)
  const tabs = $derived(tabsIn(pluginTabs(), 'chips'))
  const shown = $derived(tabs.find((t) => t.id === library.tab))
  // its page, from its plugin; Playlists is the core's own
  const blocks = $derived(shown ? pageBlocks(shown) : [])
  // no songs yet: the Playlists chip says what it is for
  const none = $derived(
    shown?.plugin === 'core' ? playlistsEmpty(!playlists.list.length) : undefined
  )
  // untracked: a write while this block is drawn
  untrack(() => library.showIn('chips'))

  let scrollEl: HTMLDivElement | undefined = $state()

  libraryOnScreen()

  // Songs dropped on the Playlists chip (ticket 089): the playlists to add
  // them to, and New playlist, where they were dropped. A chip names no
  // playlist, and opening the Playlists page under the drag would lose the
  // page they came from.
  const toPlaylists: DropTarget = {
    drop: (d, x, y) => menu.show(x, y, playlistMenu(d.keys, { from: d.from, link: d.link }))
  }

  scrollTopOnChange(
    () => scrollEl,
    () => libraryView()
  )
</script>

<div class="lib" data-notice-host>
  <div class="top">
    <div class="searchrow">
      <HistoryButtons />
      <SearchBox
        placeholder={shown?.search ?? 'Search'}
        onenter={() => shown && typedIn(shown.plugin, shown.id, library.query, true)}
      />
    </div>
    <!-- the scan line takes the row's spare room, so the grid never moves -->
    <div class="chiprow">
      <div class="chips">
        {#each tabs as t (t.id)}
          <button
            class="chip"
            aria-pressed={library.tab === t.id}
            onclick={() => library.pickTab(t.id)}
            use:dropTarget={t.id === playlistsTab ? toPlaylists : undefined}>{t.label}</button
          >
        {/each}
      </div>
      <ScanLine />
    </div>
  </div>
  <div class="scroll" bind:this={scrollEl}>
    {#if !tabs.length}
      <div class="fill"><NoPlugins /></div>
    {:else if none}
      <div class="fill"><Nothing block={none.block} plugin={none.plugin} /></div>
    {:else if shown && shown.plugin !== 'core'}
      {#key shown.id}
        <BlockPage {blocks} tab={shown.id} plugin={shown.plugin} {scrollEl} nav="chips" />
      {/key}
    {:else if shown?.plugin === 'core'}
      {#if library.openPlaylist}
        <PlaylistView id={library.openPlaylist} {scrollEl} nav="chips" back />
      {:else}
        <PlaylistList />
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
