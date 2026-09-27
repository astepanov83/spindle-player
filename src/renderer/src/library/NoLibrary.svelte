<!-- What the library shows before there are any songs. -->
<script lang="ts">
  import { library } from '../stores/library.svelte'
  import { scanLine } from './scan-text'

  const s = $derived(library.status)
  const scanning = $derived(s.phase !== 'idle')
</script>

<div class="none">
  {#if scanning}
    <b>Looking for music</b>
    <p>{scanLine(s)}</p>
  {:else if !s.folders.length}
    <b>No music yet</b>
    <p>
      Add a folder with your music. Spindle reads the songs in it, and checks it again each time it
      starts.
    </p>
    <button class="pill" onclick={() => window.libraryApi.addFolder()}>Add music folder</button>
  {:else}
    <b>No songs found</b>
    <p>
      Spindle found no songs it can play in {s.folders.length === 1
        ? s.folders[0]
        : `${s.folders.length} folders`}.
    </p>
    <button class="pill" onclick={() => window.libraryApi.addFolder()}>Add music folder</button>
  {/if}
</div>

<style>
  .none {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 30px;
    text-align: center;
  }
  b {
    font-family: var(--display);
    font-size: 22px;
    letter-spacing: -0.01em;
  }
  p {
    margin: 0 0 14px;
    max-width: 44ch;
    color: var(--ink-3);
    font-size: 14px;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
  .pill {
    padding: 9px 18px;
    border-radius: 99px;
    font-size: 14px;
    font-weight: 600;
    background: var(--ink);
    color: var(--bg);
  }
</style>
