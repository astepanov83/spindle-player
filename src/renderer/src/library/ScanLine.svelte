<!-- A scan in the main window (ticket 045): after Studio's chips, at the foot
     of Classic's sidebar. The lines come from the plugins that are on. -->
<script lang="ts">
  import Spinner from '../ui/Spinner.svelte'
  import { statusLines } from '../plugins'

  // Classic's sidebar is narrow: the line wraps there
  let { wrap = false }: { wrap?: boolean } = $props()

  const lines = $derived(statusLines())
</script>

{#each lines as line, i (i)}
  <p class="scan" class:wrap>
    <Spinner /><span class="txt" title={line}>{line}</span>
  </p>
{/each}

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
