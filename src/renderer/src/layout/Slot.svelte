<!-- A named place where containers put buttons. Every player style renders player.buttons. -->
<script lang="ts">
  import IconButton from '../ui/IconButton.svelte'
  import { layout } from '../stores/layout.svelte'
  import type { SlotButton, SlotName } from './build'

  let { name }: { name: SlotName } = $props()

  function run(b: SlotButton): void {
    if (b.act === 'queue') layout.toggleQueue()
  }
</script>

<span class="slot" data-slot={name}>
  {#each layout.slots[name] as b (b.act)}
    <IconButton
      icon={b.act}
      label={b.label}
      on={b.act === 'queue' && layout.showQueue}
      act={b.act}
      onclick={() => run(b)}
    />
  {/each}
</span>

<style>
  .slot {
    display: flex;
    gap: 2px;
    align-items: center;
  }
</style>
