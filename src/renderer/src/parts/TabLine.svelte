<!-- What plays, small, above the stack controls while the Queue tab hides
     Now playing (ticket 040), so the title and artist never go away. -->
<script lang="ts">
  import PlayingText from './PlayingText.svelte'
  import { layout } from '../stores/layout.svelte'
  import { playing } from '../stores/playing.svelte'
</script>

{#if layout.queueMode === 'tab' && layout.tabSel === 1 && playing.title}
  <div class="tabline">
    <div class="song-title" title={playing.title}><PlayingText line="title" /></div>
    <div class="song-sub" title={playing.sub}><PlayingText line="sub" /></div>
  </div>
{/if}

<style>
  .tabline {
    min-width: 0;
  }
  .song-title {
    font-size: var(--text-l);
  }
  .song-sub {
    font-size: var(--text-s);
    margin-top: 1px;
  }
</style>
