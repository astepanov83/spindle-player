<script lang="ts">
  import Icon from '../ui/Icon.svelte'
  import IconButton from '../ui/IconButton.svelte'
  import { player } from '../stores/player.svelte'
  import { playing } from '../stores/playing.svelte'
</script>

<div class="transport">
  <IconButton
    icon="shuffle"
    label="Shuffle"
    on={player.shuffle}
    onclick={() => (player.shuffle = !player.shuffle)}
  />
  <IconButton icon="prev" label="Previous" onclick={() => playing.prev()} />
  <button
    class="playbtn"
    aria-label={player.playing ? 'Pause' : 'Play'}
    onclick={() => playing.togglePlay()}
  >
    <Icon name={player.playing ? 'pause' : 'play'} size={26} />
  </button>
  <IconButton icon="next" label="Next" onclick={() => playing.next()} />
  <IconButton
    icon="repeat"
    label="Repeat"
    on={player.repeat}
    onclick={() => (player.repeat = !player.repeat)}
  />
</div>

<style>
  .transport {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  /* the filled circle; this component's class wins over the global button reset */
  .playbtn {
    width: var(--playbtn, 54px);
    height: var(--playbtn, 54px);
    border-radius: 50%;
    background: var(--ink);
    color: var(--bg);
    display: grid;
    place-items: center;
    transition: transform 0.15s;
    flex: none;
  }
  .playbtn :global(.ico) {
    width: var(--playico, 26px) !important;
    height: var(--playico, 26px) !important;
  }
  .playbtn:hover {
    transform: scale(1.06);
  }
</style>
