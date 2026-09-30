<!-- Studio's Playlists chip: the playlists, and a button to make one. -->
<script lang="ts">
  import Empty from './Empty.svelte'
  import Icon from '../ui/Icon.svelte'
  import { filterPlaylists } from './views'
  import { library } from '../stores/library.svelte'
  import { playlists } from '../stores/playlists.svelte'

  const shown = $derived(filterPlaylists(playlists.list, library.query))

  // a playlist opens with no search: the text was for playlist names
  function create(): void {
    library.query = ''
    const id = playlists.create()
    library.openPlaylist = id
    playlists.editing = id
  }

  function open(id: string): void {
    library.query = ''
    library.openPlaylist = id
  }
</script>

<div class="pls lines">
  <button class="row new" onclick={create}>
    <span class="ic"><Icon name="plus" size={20} /></span>
    <span class="nm">New playlist</span>
  </button>
  {#each shown as p (p.id)}
    <button class="row" onclick={() => open(p.id)}>
      <span class="ic"><Icon name="list" size={20} /></span>
      <span class="nm" title={p.name}>{p.name}</span>
      <span class="n">{p.trackIds.length} {p.trackIds.length === 1 ? 'song' : 'songs'}</span>
    </button>
  {/each}
  {#if playlists.list.length && !shown.length}
    <Empty title="No matches" text="No playlist has that in its name." />
  {:else if !playlists.list.length}
    <p class="hint">
      No playlists yet. Make one here, or right-click a song and pick "New playlist".
    </p>
  {/if}
</div>

<style>
  .pls {
    display: flex;
    flex-direction: column;
    padding-top: 4px;
  }
  .row {
    display: grid;
    grid-template-columns: 40px 1fr auto;
    gap: 14px;
    align-items: center;
    padding: 8px 12px;
    min-height: 56px;
    font-size: var(--text-l);
  }
  .ic {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    background: var(--field);
    color: var(--ink-2);
  }
  .new .nm {
    color: var(--ink-2);
  }
  .nm {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .n {
    color: var(--ink-3);
    font-size: var(--text-s);
    font-variant-numeric: tabular-nums;
  }
  .hint {
    color: var(--ink-3);
    font-size: var(--text-m);
    line-height: 1.6;
    padding: 16px 12px;
    max-width: 44ch;
  }
</style>
