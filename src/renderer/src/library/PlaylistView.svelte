<!-- One playlist: its songs in a table, with Play, Rename and Delete. -->
<script lang="ts">
  import SongTable from './SongTable.svelte'
  import Icon from '../ui/Icon.svelte'
  import { nextPlaylistSort, playlistRows, sortRows } from './views'
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
  let confirmDelete = $state(false)

  // a different playlist starts without the delete question
  $effect(() => {
    void id
    confirmDelete = false
  })

  function play(): void {
    if (!p) return
    const rows = sortRows(view.rows, library.playlistSort, (t) => library.order(t))
    queue.playList(
      rows.map((t) => t.id),
      0,
      p.name
    )
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
    <button class="back" onclick={() => (library.openPlaylist = null)}
      ><Icon name="back" size={16} />All playlists</button
    >
  {/if}
  <SongTable
    title={p.name}
    meta="Playlist"
    items={view.rows}
    {scrollEl}
    sort={library.playlistSort}
    onsort={(k) => (library.playlistSort = nextPlaylistSort(library.playlistSort, k))}
    playlistId={id}
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
          <h2 class="page-title">{p.name}</h2>
        {/if}
        <div class="acts">
          <button class="pill" disabled={!view.rows.length} onclick={play}>Play</button>
          <button class="pill ghost" onclick={() => (playlists.editing = id)}>Rename</button>
          {#if confirmDelete}
            <button class="pill danger" onclick={() => playlists.remove(id)}>Delete playlist</button
            >
            <button class="pill ghost" onclick={() => (confirmDelete = false)}>Keep</button>
          {:else}
            <button class="pill ghost" onclick={() => (confirmDelete = true)}>Delete</button>
          {/if}
        </div>
      </div>
    {/snippet}
  </SongTable>
  {#if !p.trackIds.length}
    <p class="hint">
      Empty for now. Right-click a song to add it, or use "Add to playlist" on an album page.
    </p>
  {/if}
{/if}

<style>
  .back {
    font-size: 13px;
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
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }
  .pill {
    padding: 8px 16px;
    border-radius: 99px;
    font-size: 14px;
    font-weight: 600;
    background: var(--ink);
    color: var(--bg);
  }
  .pill:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .pill.ghost {
    background: var(--field);
    color: var(--ink);
  }
  .pill.danger {
    background: var(--close-hover);
    color: var(--on-danger);
  }
  .hint {
    color: var(--ink-3);
    font-size: 14px;
    line-height: 1.6;
    padding: 20px 12px;
    max-width: 50ch;
  }
</style>
