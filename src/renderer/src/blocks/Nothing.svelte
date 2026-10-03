<!-- An empty block alone on a page: it fills the view ("No music yet"). -->
<script lang="ts">
  import type { PluginId } from '../../../shared/plugins'
  import { actOnPage } from '../plugins'
  import type { EmptyBlock } from '../plugins/types'

  let { block: b, plugin }: { block: EmptyBlock; plugin: PluginId } = $props()
</script>

<div class="none">
  <b>{b.title}</b>
  <p>{b.text}</p>
  {#if b.action}
    {@const a = b.action}
    <button class="pill" onclick={() => actOnPage(plugin, b.id, a.id)}>{a.label}</button>
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
