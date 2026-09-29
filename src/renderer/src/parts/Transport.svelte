<script lang="ts">
  import IconButton from '../ui/IconButton.svelte'
  import PlayButton from './PlayButton.svelte'
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
  <PlayButton
    icon={player.playing ? 'pause' : 'play'}
    label={player.playing ? 'Pause' : 'Play'}
    onclick={() => playing.togglePlay()}
  />
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
</style>
