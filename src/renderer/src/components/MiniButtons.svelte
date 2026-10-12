<!-- Mini's own window buttons, in place of a title bar: back to the big
     layout, and the pin that keeps it on top. Right click has the rest. -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte'
  import { layout } from '../stores/layout.svelte'
  import { settings } from '../stores/settings.svelte'
  import { templates } from '../../../shared/templates'

  const big = $derived(templates[settings.bigTemplate].name)
</script>

<div class="minibtns">
  <button
    aria-label="Back to {big}"
    title="Back to {big} (or double click the bar)"
    onclick={() => layout.toBig()}
  >
    <Icon name="bigger" size={13} />
  </button>
  <button
    class:on={settings.miniOnTop}
    aria-label="Keep on top"
    aria-pressed={settings.miniOnTop}
    title={settings.miniOnTop ? 'On top of other windows' : 'Keep on top of other windows'}
    onclick={() => (settings.miniOnTop = !settings.miniOnTop)}
  >
    <Icon name={settings.miniOnTop ? 'pinOn' : 'pinOff'} size={13} />
  </button>
</div>

<style>
  .minibtns {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    padding: 0 4px;
  }
  button {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    color: var(--ink-2);
  }
  button:hover {
    background: var(--hover);
    color: var(--ink);
  }
  button.on {
    color: var(--c2);
  }
</style>
