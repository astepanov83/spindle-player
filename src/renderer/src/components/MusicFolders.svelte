<!-- "Music folders" in the settings sheet. Main owns the list; this only asks. -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte'
  import { canRescan, statusLines } from '../library/scan-text'
  import { library } from '../stores/library.svelte'

  const s = $derived(library.status)
  // with settings.json unreadable, main would change the list in memory only
  const locked = $derived(!!s.settingsUnreadable)
</script>

<div class="set">
  <span class="label">Music folders</span>
  {#if s.folders.length}
    <ul>
      {#each s.folders as f (f)}
        <li>
          <span class="path" title={f}>{f}</span>
          {#if s.missing.includes(f)}<span class="miss">not found</span>{/if}
          <button
            class="rm"
            aria-label="Remove {f}"
            title="Remove"
            disabled={locked}
            onclick={() => window.libraryApi.removeFolder(f)}
            ><Icon name="close" size={16} /></button
          >
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
  .label {
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-3);
    font-weight: 600;
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
    font-size: 13px;
    min-height: 32px;
  }
  li + li {
    box-shadow: 0 -1px 0 var(--edge);
  }
  .path {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .miss {
    font-size: 12px;
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
    font: 500 13px var(--ui);
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
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--ink-2);
  }
</style>
