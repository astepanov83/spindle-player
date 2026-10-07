<!-- A named place where containers put buttons. Every player style renders player.buttons. -->
<script lang="ts">
  import IconButton from '../ui/IconButton.svelte'
  import { layout } from '../stores/layout.svelte'
  import type { SlotButton, SlotName } from './build'
  import { queue } from '../stores/queue.svelte'
  import type { DropTarget } from '../stores/song-drag.svelte'

  let { name }: { name: SlotName } = $props()

  function run(b: SlotButton): void {
    if (b.act === 'queue') layout.toggleQueue()
  }

  // Songs dropped on the queue button go at the end (ticket 089); resting on
  // it opens the queue, to drop them at a place.
  const onQueue: DropTarget = {
    drop: (d) => queue.append(d.keys, d.from, d.link),
    rest: () => layout.openQueue()
  }
</script>

<span class="slot" data-slot={name}>
  {#each layout.slots[name] as b (b.act)}
    <IconButton
      icon={b.act}
      label={b.label}
      on={b.act === 'queue' && layout.showQueue}
      act={b.act}
      drop={b.act === 'queue' ? onQueue : undefined}
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
