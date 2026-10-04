<!-- A tree block: the path bar over a folder, each step up a button. A step
     keeps the search text, so a match further down can be followed. -->
<script lang="ts">
  import { openFrom } from '../plugins'
  import type { TreeBlock } from '../plugins/types'

  let { block: b, tab }: { block: TreeBlock; tab: string } = $props()
</script>

<nav class="crumbs" aria-label={b.label}>
  {#each b.path as c, n (n)}
    {#if n > 0}<span class="sep" aria-hidden="true">/</span>{/if}
    <button class="crumb" disabled={c.here} title={c.hint} onclick={() => openFrom(tab, c.to, true)}
      >{c.title}</button
    >
  {/each}
</nav>

<style>
  .crumbs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 4px;
    font-size: var(--text-s);
    color: var(--ink-3);
    margin-top: 4px;
    min-height: 20px;
  }
  .crumb {
    color: var(--ink-3);
    padding: 1px 4px;
    margin: 0 -4px;
    border-radius: 5px;
    max-width: 32ch;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .crumb:hover:not(:disabled) {
    color: var(--ink);
    background: var(--hover);
  }
  .crumb:disabled {
    color: var(--ink-2);
    cursor: default;
  }
  .sep {
    opacity: 0.6;
    padding: 0 4px;
  }
</style>
