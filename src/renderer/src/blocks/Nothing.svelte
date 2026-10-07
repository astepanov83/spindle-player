<!-- An empty block alone on a page: it fills the view ("No music yet"). -->
<script lang="ts">
  import type { PluginId } from '../../../shared/plugins'
  import { actOnPage } from '../plugins'
  import type { ShownTab } from '../plugins/tabs'
  import type { EmptyBlock } from '../plugins/types'
  import SearchButtons from './SearchButtons.svelte'

  // `wider`: the tabs to search instead, when it says nothing was found
  let {
    block: b,
    plugin,
    wider = []
  }: { block: EmptyBlock; plugin: PluginId; wider?: ShownTab[] } = $props()
</script>

<div class="none">
  {#if b.title}<b>{b.title}</b>{/if}
  <p>{b.text}</p>
  {#if b.action || wider.length}
    <div class="acts">
      {#if b.action}
        {@const a = b.action}
        <button class="pill" onclick={() => actOnPage(plugin, b.id, a.id)}>{a.label}</button>
      {/if}
      <SearchButtons tabs={wider} />
    </div>
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
  .acts {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    max-width: 100%;
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
