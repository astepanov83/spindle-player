<!-- What the library shows before there are any songs. -->
<script lang="ts">
  import { library } from '../stores/library.svelte'
  import { playlists } from '../stores/playlists.svelte'
  import { libraryProblem, scanLine, settingsText, stoppedText } from './scan-text'

  // Studio's Playlists chip: it says what it is for, not just "No music yet"
  let { view }: { view?: 'playlists' } = $props()

  const s = $derived(library.status)
  const scanning = $derived(s.phase !== 'idle')
  const problem = $derived(libraryProblem(s, library.loadFailed))

  const noPlaylists = $derived(view === 'playlists' && !playlists.list.length)
</script>

<div class="none">
  {#if problem}
    <b>{problem === stoppedText ? 'Library stopped' : 'Library not loaded'}</b>
    <p>{problem}</p>
  {:else if s.settingsUnreadable && !s.folders.length}
    <b>Settings not loaded</b>
    <p>{settingsText}</p>
  {:else if scanning}
    <b>Looking for music</b>
    <p>{scanLine(s)}</p>
  {:else if noPlaylists}
    <b>No playlists yet</b>
    <p>
      A playlist is made from your songs. {s.folders.length
        ? 'Spindle found none it can play yet.'
        : 'Add a folder with your music first.'} Then right-click a song and pick "New playlist".
    </p>
    <button class="pill" onclick={() => window.libraryApi.addFolder()}>Add music folder</button>
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
    font-size: var(--title-m);
    letter-spacing: -0.01em;
  }
  p {
    margin: 0 0 14px;
    max-width: 44ch;
    color: var(--ink-3);
    font-size: var(--text-m);
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
</style>
