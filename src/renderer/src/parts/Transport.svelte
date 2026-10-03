<script lang="ts">
  import IconButton from '../ui/IconButton.svelte'
  import PlayButton from './PlayButton.svelte'
  import { player } from '../stores/player.svelte'
  import { queues } from '../stores/queues.svelte'
</script>

<div class="transport">
  <IconButton
    icon="shuffle"
    label="Shuffle"
    on={player.shuffle}
    onclick={() => (player.shuffle = !player.shuffle)}
  />
  <IconButton
    icon="prev"
    label="Previous"
    disabled={queues.nothing}
    onclick={() => queues.prev()}
  />
  <PlayButton
    icon={queues.wantsSound ? 'pause' : 'play'}
    label={queues.wantsSound ? 'Pause' : 'Play'}
    disabled={queues.nothing}
    onclick={() => queues.togglePlay()}
  />
  <IconButton icon="next" label="Next" disabled={queues.nothing} onclick={() => queues.next()} />
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
</style>
