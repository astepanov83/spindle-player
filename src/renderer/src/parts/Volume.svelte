<script lang="ts">
  import Icon from '../ui/Icon.svelte'
  import { settings } from '../stores/settings.svelte'

  let { width = 90 }: { width?: number } = $props()
</script>

<div class="vol">
  <Icon name="vol" />
  <input
    type="range"
    min="0"
    max="100"
    aria-label="Volume"
    style:width="{width}px"
    bind:value={settings.volume}
  />
</div>

<style>
  .vol {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--ink-2);
  }
  input {
    accent-color: var(--ink);
  }
</style>
