<!-- How fast a long song plays (ticket 114): a few letters next to its
     times that open a menu of speeds. Only for songs of 20 minutes or more
     (an audiobook, a talk); a short song plays at 1x and shows nothing. -->
<script lang="ts">
  import { isLong } from '../../../shared/positions'
  import { speeds, speedText } from '../queue/bar'
  import { menu } from '../stores/menu.svelte'
  import { player } from '../stores/player.svelte'
  import { queue } from '../stores/queue.svelte'
  import { queues } from '../stores/queues.svelte'

  const shown = $derived(queues.active === 'track' && !!queue.playable && isLong(player.duration))

  function open(e: MouseEvent): void {
    menu.showFor(e, [
      { heading: 'Speed' },
      ...speeds.map((r) => ({
        label: speedText(r),
        checked: r === queue.speed,
        run: () => queue.setSpeed(r)
      }))
    ])
  }
</script>

{#if shown}
  <button
    class="speed"
    class:on={queue.speed !== 1}
    aria-haspopup="menu"
    aria-label="Speed: {speedText(queue.speed)}"
    title="Speed"
    onclick={open}>{speedText(queue.speed)}</button
  >
{/if}

<style>
  /* as small as the times beside it, so the row keeps its height */
  .speed {
    flex: none;
    padding: 0 6px;
    border-radius: 999px;
    font: inherit;
    font-weight: 600;
    color: var(--ink-2);
    line-height: 1.5;
  }
  .speed:hover {
    color: var(--ink);
    background: var(--active);
  }
  .speed.on {
    color: var(--c2);
  }
</style>
