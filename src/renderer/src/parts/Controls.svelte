<!-- The controls part: radio's own controls or the song's, by what plays.
     Templates don't know about radio, and a switch doesn't rebuild the layout. -->
<script lang="ts">
  import RadioControls from './RadioControls.svelte'
  import SongControls from './SongControls.svelte'
  import { playing } from '../stores/playing.svelte'

  let { style }: { style: 'stack' | 'bar' } = $props()
</script>

{#if playing.kind === 'radio'}
  <RadioControls {style} />
{:else}
  <SongControls {style} />
{/if}
