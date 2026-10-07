<!-- A chips block: words to search for. A click puts the word in the search
     box and searches at once, as Enter would, then gives the box the focus,
     since the chips go away while it searches. -->
<script lang="ts">
  import type { PluginId } from '../../../shared/plugins'
  import { typedIn } from '../plugins'
  import type { ChipsBlock } from '../plugins/types'
  import { library } from '../stores/library.svelte'

  let { block: b, tab, plugin }: { block: ChipsBlock; tab: string; plugin: PluginId } = $props()

  function search(word: string): void {
    library.query = word
    typedIn(plugin, tab, word, true)
    document.querySelector<HTMLInputElement>('input[data-search]')?.focus()
  }
</script>

<div class="chips" role="group" aria-label={b.label}>
  <span class="label">{b.label}</span>
  {#each b.words as w (w)}
    <button class="chip" title="Search for {w}" onclick={() => search(w)}>{w}</button>
  {/each}
</div>

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 14px 12px 4px;
  }
  .label {
    color: var(--ink-3);
    font-size: var(--text-s);
    margin-right: 4px;
  }
</style>
