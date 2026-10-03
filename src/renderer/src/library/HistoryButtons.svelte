<!-- Back and Forward through the library's history (ticket 051): the same
     steps as the mouse side buttons and Alt+Left / Alt+Right. -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte'
  import { library } from '../stores/library.svelte'

  // px: Studio's sit beside the search box, Classic's in a label row
  let { size = 34 }: { size?: number } = $props()
</script>

<div class="hist" style:--hb="{size}px">
  <button
    aria-label="Back"
    title="Back (Alt+Left)"
    disabled={!library.canBack}
    onclick={() => library.back()}><Icon name="back" size={Math.round(size * 0.6)} /></button
  >
  <button
    aria-label="Forward"
    title="Forward (Alt+Right)"
    disabled={!library.canForward}
    onclick={() => library.forward()}><Icon name="forward" size={Math.round(size * 0.6)} /></button
  >
</div>

<style>
  .hist {
    display: flex;
    flex: none;
    gap: 2px;
  }
  button {
    width: var(--hb);
    height: var(--hb);
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--ink-2);
  }
  button:hover:not(:disabled) {
    background: var(--hover);
    color: var(--ink);
  }
  button:active:not(:disabled) {
    background: var(--active);
  }
  button:disabled {
    opacity: 0.35;
    cursor: default;
  }
</style>
