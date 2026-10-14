<!-- Play with what the item can do around it: Previous and Next by its `can`
     (hidden, not disabled, when it can't: decision 150), Shuffle and Repeat
     for the track queue. A live item stops: pause drops its connection. -->
<script lang="ts">
  import IconButton from '../ui/IconButton.svelte'
  import PlayButton from './PlayButton.svelte'
  import { chordFor } from '../keys'
  import { player } from '../stores/player.svelte'
  import { queues } from '../stores/queues.svelte'
  import { openShuffleMenu } from './shuffle-menu'

  // false: no Shuffle and Repeat, only what plays now (Mini)
  let { order = true }: { order?: boolean } = $props()

  const bar = $derived(queues.bar)
  const showOrder = $derived(order && bar.order)
  const pauseWord = $derived(bar.live ? 'Stop' : 'Pause')
  // a press turns on what was picked last; a right click picks (ticket 125)
  const shuffleWord = $derived(`Shuffle ${player.shuffleBy}`)
  const shuffleHint = $derived(
    `${shuffleWord} (${chordFor('shuffle')}). Right-click to pick songs or albums`
  )
</script>

<div class="transport" class:alone={!showOrder && !bar.previous && !bar.next}>
  {#if showOrder}
    <IconButton
      icon={player.shuffleBy === 'albums' ? 'shuffleAlbums' : 'shuffle'}
      label={shuffleWord}
      hint={shuffleHint}
      on={player.shuffle}
      toggle
      onclick={() => (player.shuffle = !player.shuffle)}
      oncontextmenu={openShuffleMenu}
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
  {#if showOrder}
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
