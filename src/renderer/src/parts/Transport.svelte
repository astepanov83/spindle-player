<!-- Play with what the item can do around it: Previous and Next by its `can`
     (hidden, not disabled, when it can't: decision 150), Shuffle and Repeat
     for the track queue. A live item stops: pause drops its connection. -->
<script lang="ts">
  import IconButton from '../ui/IconButton.svelte'
  import PlayButton from './PlayButton.svelte'
  import { player } from '../stores/player.svelte'
  import { queues } from '../stores/queues.svelte'

  const bar = $derived(queues.bar)
  const pauseWord = $derived(bar.live ? 'Stop' : 'Pause')
</script>

<div class="transport" class:alone={!bar.order && !bar.previous && !bar.next}>
  {#if bar.order}
    <IconButton
      icon="shuffle"
      label="Shuffle"
      on={player.shuffle}
      toggle
      onclick={() => (player.shuffle = !player.shuffle)}
    />
  {/if}
  {#if bar.previous}
    <IconButton
      icon="prev"
      label="Previous"
      disabled={queues.nothing}
      onclick={() => queues.prev()}
    />
  {/if}
  <PlayButton
    icon={queues.wantsSound ? (bar.live ? 'stop' : 'pause') : 'play'}
    label={queues.wantsSound ? pauseWord : 'Play'}
    disabled={queues.nothing}
    onclick={() => queues.togglePlay()}
  />
  {#if bar.next}
    <IconButton icon="next" label="Next" disabled={queues.nothing} onclick={() => queues.next()} />
  {/if}
  {#if bar.order}
    <IconButton
      icon="repeat"
      label="Repeat"
      on={player.repeat}
      toggle
      onclick={() => (player.repeat = !player.repeat)}
    />
  {/if}
</div>

<style>
  .transport {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .alone {
    justify-content: center;
  }
</style>
