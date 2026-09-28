<!-- Studio's Playlists chip: the playlists, and a button to make one. -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte'
  import { library } from '../stores/library.svelte'
  import { playlists } from '../stores/playlists.svelte'

  function create(): void {
    const id = playlists.create()
    library.playlistSort = null
    library.openPlaylist = id
    playlists.editing = id
  }

  function open(id: string): void {
    library.playlistSort = null
    library.openPlaylist = id
  }
</script>

<div class="pls">
  <button class="row new" onclick={create}>
    <span class="ic"><Icon name="plus" size={20} /></span>
    <span class="nm">New playlist</span>
  </button>
  {#each playlists.list as p (p.id)}
    <button class="row" onclick={() => open(p.id)}>
      <span class="ic"><Icon name="list" size={20} /></span>
      <span class="nm">{p.name}</span>
      <span class="n">{p.trackIds.length} {p.trackIds.length === 1 ? 'song' : 'songs'}</span>
    </button>
  {/each}
  {#if !playlists.list.length}
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
    text-align: left;
    padding: 8px 12px;
    min-height: 56px;
    border-radius: 10px;
    font-size: 15px;
  }
  .row + .row {
    box-shadow: 0 -1px 0 var(--edge);
  }
  .row:hover {
    background: var(--hover);
    box-shadow: none;
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
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .hint {
    color: var(--ink-3);
    font-size: 14px;
    line-height: 1.6;
    padding: 16px 12px;
    max-width: 44ch;
  }
</style>
