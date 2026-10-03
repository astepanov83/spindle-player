<!-- The controls part: the live item's controls or the song's, by which queue
     plays. Templates don't know about it, and a switch doesn't rebuild the
     layout. Until the player bar is drawn from data (ticket 058), a live item
     gets radio's own controls. -->
<script lang="ts">
  import RadioControls from './RadioControls.svelte'
  import SongControls from './SongControls.svelte'
  import { queues } from '../stores/queues.svelte'

  let { style }: { style: 'stack' | 'bar' } = $props()
</script>

{#if queues.active === 'live'}
  <RadioControls {style} />
{:else}
  <SongControls {style} />
{/if}
