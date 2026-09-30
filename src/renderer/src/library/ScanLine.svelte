<!-- A scan in the main window (ticket 045): after Studio's chips, at the foot
     of Classic's sidebar. With no songs yet, NoLibrary shows it instead. -->
<script lang="ts">
  import Spinner from '../ui/Spinner.svelte'
  import { library } from '../stores/library.svelte'
  import { scanLine } from './scan-text'

  // Classic's sidebar is narrow: the line wraps there
  let { wrap = false }: { wrap?: boolean } = $props()

  const s = $derived(library.status)
</script>

{#if s.phase !== 'idle' && library.albums.length}
  <p class="scan" class:wrap>
    <Spinner /><span class="txt" title={scanLine(s)}>{scanLine(s)}</span>
  </p>
{/if}

<style>
  .scan {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: var(--text-s);
    color: var(--ink-3);
    min-width: 0;
  }
  .txt {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .wrap {
    align-items: flex-start;
    line-height: 1.4;
  }
  .wrap :global(.spinner) {
    margin-top: 3px;
  }
  .wrap .txt {
    white-space: normal;
  }
</style>
