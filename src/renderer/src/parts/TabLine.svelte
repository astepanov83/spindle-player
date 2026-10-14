<!-- What plays, small, above the stack controls while the Queue tab hides
     Now playing (ticket 040), so the title and artist never go away. -->
<script lang="ts">
  import PlayingText from './PlayingText.svelte'
  import { openPlayingMenu } from './playing-menu'
  import { layout } from '../stores/layout.svelte'
  import { queues } from '../stores/queues.svelte'
</script>

{#if layout.queueMode === 'tab' && layout.tabSel === 1 && queues.title}
  <!-- a right click is the song menu (ticket 127); the keys have I for Song info -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="tabline" oncontextmenu={openPlayingMenu}>
    <div class="song-title" title={queues.title}><PlayingText line="title" /></div>
    <div class="song-sub" title={queues.sub}><PlayingText line="sub" /></div>
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
