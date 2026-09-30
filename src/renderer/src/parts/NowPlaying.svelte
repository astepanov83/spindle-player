<script lang="ts">
  import PlayingText from './PlayingText.svelte'
  import Stage from '../visualizer/Stage.svelte'
  import { playing } from '../stores/playing.svelte'

  let { style }: { style: 'panel' | 'full' } = $props()
</script>

<div class="np {style}">
  <Stage />
  <div class="meta">
    {#if playing.title}
      <div class="song-title"><PlayingText line="title" /></div>
      <div class="song-sub"><PlayingText line="sub" /></div>
    {:else}
      <div class="song-title">Nothing playing</div>
      <div class="song-sub">Pick an album or a song to start</div>
    {/if}
  </div>
</div>

<style>
  .np {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 6px 22px 0;
    min-height: 0;
  }
  .np > :global(.vstage) {
    flex: 1;
    margin: 0 -22px;
    min-height: 160px;
  }
  .meta {
    flex: none;
  }
  .song-title {
    font-size: 21px;
  }
  .full .meta {
    text-align: center;
  }
  .full .song-title {
    font-size: 24px;
  }
</style>
