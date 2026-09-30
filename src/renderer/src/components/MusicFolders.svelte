<!-- "Music folders" in the settings sheet. Main owns the list; this only asks. -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte'
  import { canRescan, pathEnds, statusLines } from '../library/scan-text'
  import { library } from '../stores/library.svelte'

  const s = $derived(library.status)
  // with settings.json unreadable, main would change the list in memory only
  const locked = $derived(!!s.settingsUnreadable)
  // Removing drops the folder's songs and artist names, so it asks first,
  // like deleting a playlist. One folder at a time.
  let asking: string | null = $state(null)

  function remove(f: string): void {
    asking = null
    window.libraryApi.removeFolder(f)
  }
</script>

<div class="set">
  <span class="section-label">Music folders</span>
  {#if s.folders.length}
    <ul>
      {#each s.folders as f (f)}
        {@const [head, tail] = pathEnds(f)}
        <li>
          <!-- cut in the middle: the folder's own name stays -->
          <span class="path" title={f}
            ><span class="head">{head}</span><span class="tail">{tail}</span></span
          >
          <!-- while it asks, the path gets the room -->
          {#if s.missing.includes(f) && asking !== f}<span class="miss">not found</span>{/if}
          {#if asking === f}
            <button class="sm pill danger" disabled={locked} onclick={() => remove(f)}
              >Remove folder</button
            >
            <button class="sm pill ghost" onclick={() => (asking = null)}>Cancel</button>
          {:else}
            <button
              class="rm"
              aria-label="Remove {f}"
              title="Remove"
              disabled={locked}
              onclick={() => (asking = f)}><Icon name="close" size={16} /></button
            >
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  <div class="acts">
    <button class="btn" disabled={locked} onclick={() => window.libraryApi.addFolder()}
      >Add folder</button
    >
    <button
      class="btn"
      disabled={!canRescan(s, library.loadFailed)}
      onclick={() => window.libraryApi.rescan()}>Rescan</button
    >
  </div>
  <div aria-live="polite">
    {#each statusLines(s, library.loadFailed) as line (line)}
      <p class="hint">{line}</p>
    {/each}
  </div>
</div>

<style>
  .set {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 3px;
    border-radius: 10px;
    background: var(--well);
  }
  li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 4px 4px 10px;
    font-size: var(--text-s);
    min-height: 32px;
  }
  li + li {
    box-shadow: 0 -1px 0 var(--edge);
  }
  .path {
    flex: 1;
    min-width: 0;
    display: flex;
    white-space: nowrap;
  }
  .head {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tail {
    flex: none;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* small pills, to fit the row */
  .sm {
    flex: none;
    padding: 5px 10px;
    font-size: var(--text-s);
  }
  .miss {
    font-size: var(--text-xs);
    color: var(--ink-3);
    flex: none;
  }
  .rm {
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    display: grid;
    place-items: center;
    color: var(--ink-3);
  }
  .rm:hover:not(:disabled) {
    background: var(--hover);
    color: var(--ink);
  }
  .acts {
    display: flex;
    gap: 6px;
  }
  .btn {
    font: 500 var(--text-s) var(--ui);
    padding: 7px 12px;
    border-radius: 8px;
    background: var(--field);
    color: var(--ink);
  }
  .btn:hover:not(:disabled) {
    background: var(--active);
  }
  .btn:disabled {
    color: var(--ink-3);
    cursor: default;
  }
  .rm:disabled {
    cursor: default;
    opacity: 0.4;
  }
  .hint {
    margin: 0;
    font-size: var(--text-s);
    line-height: 1.45;
    color: var(--ink-2);
  }
</style>
