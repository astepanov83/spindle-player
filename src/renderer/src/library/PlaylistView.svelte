<!-- One playlist: its songs in a table, with Play, Shuffle, Rename and Delete. -->
<script lang="ts">
  import SongTable from './SongTable.svelte'
  import SearchButtons from '../blocks/SearchButtons.svelte'
  import Icon from '../ui/Icon.svelte'
  import { openSongMenu } from './song-menu'
  import { filterItems, playlistRows, sortItems } from './views'
  import { infoOf, itemInfo, widerTabs } from '../plugins'
  import type { NavKind } from '../plugins/types'
  import { library, playlistsTab } from '../stores/library.svelte'
  import { playlists } from '../stores/playlists.svelte'
  import { playPage, playState } from '../blocks/page-play'
  import { queueLink } from '../../../shared/saved-queue'
  import type { ItemKey } from '../../../shared/plugins/items'

  let {
    id,
    scrollEl,
    nav,
    back = false
  }: { id: string; scrollEl: HTMLElement | undefined; nav: NavKind; back?: boolean } = $props()

  const p = $derived(playlists.get(id))
  const view = $derived(
    p ? playlistRows(p.items, (k) => itemInfo(k).state === 'missing') : { rows: [], missing: 0 }
  )
  // the search box filters the rows; Play takes what is shown
  const shown = $derived(filterItems(view.rows, library.query, infoOf))
  // the other tabs to search, while there is text (ticket 077)
  const wider = $derived(widerTabs(playlistsTab, nav))
  let confirmDelete = $state(false)

  // a different playlist starts without the delete question
  $effect(() => {
    void id
    confirmDelete = false
  })

  // what the table shows, as sorted there
  const playIds = (): ItemKey[] => sortItems(shown, library.playlistSort(id), infoOf)

  const link = $derived(queueLink('playlist', id))

  // Rows move (drag, Alt+Up / Alt+Down) only while the table shows the
  // playlist's own order, all of it: in a sort or a search, a place among
  // the rows shown is no place in the playlist.
  const canMove = $derived(library.playlistSort(id) === null && shown === view.rows)
  const move = (keys: ItemKey[]): void => playlists.move(id, keys)

  // from a song that can play: greyed ones are passed over
  function play(how: 'all' | 'shuffle'): void {
    if (p) playPage(how, playIds, p.name, link, (k) => itemInfo(k).state === 'ok')
  }

  // a step clears the text: it filtered this playlist's rows, and the list
  // would take it as a name
  function toList(): void {
    library.openPlaylistPage(null)
  }

  function focus(node: HTMLInputElement): void {
    node.focus()
    node.select()
  }

  function commit(e: Event & { currentTarget: HTMLInputElement }): void {
    if (playlists.editing !== id) return
    playlists.rename(id, e.currentTarget.value)
    playlists.editing = null
  }

  function onkeydown(e: KeyboardEvent & { currentTarget: HTMLInputElement }): void {
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape') {
      // keep the old name
      playlists.editing = null
      e.stopPropagation()
    }
  }
</script>

{#if p}
  {#if back}
    <button class="back" onclick={toList}><Icon name="back" size={16} />All playlists</button>
  {/if}
  <SongTable
    title={p.name}
    meta="Playlist"
    items={shown}
    {scrollEl}
    sort={library.playlistSort(id)}
    onsort={(k) => library.sortPlaylist(id, k)}
    playlistId={id}
    {link}
    onmove={canMove ? move : undefined}
  >
    {#snippet head()}
      <div class="head">
        <div class="page-meta">
          Playlist{view.missing
            ? ` · ${view.missing} ${view.missing === 1 ? 'song is' : 'songs are'} not in the library`
            : ''}
        </div>
        {#if playlists.editing === id}
          <input
            class="page-title name"
            aria-label="Playlist name"
            value={p.name}
            maxlength="200"
            use:focus
            onblur={commit}
            {onkeydown}
          />
        {:else}
          <h2 class="page-title clamp" title={p.name}>{p.name}</h2>
        {/if}
        <div class="acts">
          <button class="pill play" disabled={!shown.length} onclick={() => play('all')}
            >{playState(link, () => p.items) === 'pause' ? 'Pause' : 'Play'}</button
          >
          <button class="pill ghost" disabled={!shown.length} onclick={() => play('shuffle')}
            >Shuffle</button
          >
          <button class="pill ghost" onclick={() => (playlists.editing = id)}>Rename</button>
          {#if confirmDelete}
            <button class="pill danger" onclick={() => playlists.remove(id)}>Delete playlist</button
            >
            <button class="pill ghost" onclick={() => (confirmDelete = false)}>Cancel</button>
          {:else}
            <button class="pill ghost" onclick={() => (confirmDelete = true)}>Delete</button>
          {/if}
          <button
            class="pill ghost more"
            aria-haspopup="menu"
            aria-label="More"
            title="Play next, add to the queue or another playlist"
            disabled={!shown.length}
            onclick={(e) =>
              p &&
              openSongMenu(e, playIds(), {
                onPlaylist: id,
                from: p.name,
                link
              })}><Icon name="more" size={18} /></button
          >
        </div>
      </div>
    {/snippet}
  </SongTable>
  {#if !p.items.length}
    <p class="hint">
      Empty for now. Right-click a song to add it, or use "Add to playlist" on an album page.
    </p>
  {:else if view.rows.length && !shown.length}
    <p class="hint">No song in this playlist has that in its title, artist or album.</p>
  {/if}
  {#if p.items.length && wider.length}
    <div class="wider" class:found={shown.length > 0}><SearchButtons tabs={wider} /></div>
  {/if}
{/if}

<style>
  .back {
    font-size: var(--text-s);
    color: var(--ink-3);
    display: inline-flex;
    gap: 4px;
    align-items: center;
    margin: 4px 0 12px;
  }
  .back:hover {
    color: var(--ink);
  }
  .head {
    min-width: 0;
  }
  .name {
    display: block;
    width: min(100%, 520px);
    padding: 2px 6px;
    margin-left: -7px;
    color: var(--ink);
    background: var(--field);
    border: 1px solid var(--ring);
    border-radius: 8px;
    outline: none;
    box-shadow: none;
  }
  /* as wide for Pause as for Play, so the pills beside it stay put */
  .play {
    min-width: 5.6em;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }
  .wider {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 0 12px;
  }
  .wider.found {
    padding: 22px 0 0;
  }
  .hint {
    color: var(--ink-3);
    font-size: var(--text-m);
    line-height: 1.6;
    padding: 20px 12px;
    max-width: 50ch;
  }
</style>
