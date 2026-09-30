<!-- One playlist: its songs in a table, with Play, Rename and Delete. -->
<script lang="ts">
  import SongTable from './SongTable.svelte'
  import Icon from '../ui/Icon.svelte'
  import { openSongMenu } from './song-menu'
  import { filterSongs, playlistRows, sortRows } from './views'
  import { library } from '../stores/library.svelte'
  import { playlists } from '../stores/playlists.svelte'
  import { queue } from '../stores/queue.svelte'

  let {
    id,
    scrollEl,
    back = false
  }: { id: string; scrollEl: HTMLElement | undefined; back?: boolean } = $props()

  const p = $derived(playlists.get(id))
  const view = $derived(
    p
      ? playlistRows(
          p.trackIds,
          (t) => library.has(t),
          (t) => library.track(t)
        )
      : { rows: [], missing: 0 }
  )
  // the search box filters the rows; Play takes what is shown
  const shown = $derived(filterSongs(view.rows, library.query))
  let confirmDelete = $state(false)

  // a different playlist starts without the delete question
  $effect(() => {
    void id
    confirmDelete = false
  })

  // what the table shows, as sorted there
  const playIds = (): string[] =>
    sortRows(shown, library.playlistSort(id), (t) => library.order(t)).map((t) => t.id)

  function play(): void {
    if (!p) return
    queue.playList(playIds(), 0, p.name, { kind: 'playlist', id })
  }

  // the text filtered this playlist's rows; the list would take it as a name
  function toList(): void {
    library.query = ''
    library.openPlaylist = null
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
    link={{ kind: 'playlist', id }}
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
          <button class="pill" disabled={!shown.length} onclick={play}>Play</button>
          <button class="pill ghost" onclick={() => (playlists.editing = id)}>Rename</button>
          {#if confirmDelete}
            <button class="pill danger" onclick={() => playlists.remove(id)}>Delete playlist</button
            >
            <button class="pill ghost" onclick={() => (confirmDelete = false)}>Keep</button>
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
                link: { kind: 'playlist', id }
              })}><Icon name="more" size={18} /></button
          >
        </div>
      </div>
    {/snippet}
  </SongTable>
  {#if !p.trackIds.length}
    <p class="hint">
      Empty for now. Right-click a song to add it, or use "Add to playlist" on an album page.
    </p>
  {:else if view.rows.length && !shown.length}
    <p class="hint">No song in this playlist has that in its title, artist or album.</p>
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
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }
  .hint {
    color: var(--ink-3);
    font-size: var(--text-m);
    line-height: 1.6;
    padding: 20px 12px;
    max-width: 50ch;
  }
</style>
