<script lang="ts">
  import Stage from '../visualizer/Stage.svelte'
  import { queue } from '../stores/queue.svelte'

  let { style }: { style: 'panel' | 'full' } = $props()
</script>

<div class="np {style}">
  <Stage />
  <div class="meta">
    {#if queue.current}
      <div class="song-title">{queue.current.title}</div>
      <div class="song-sub">{queue.current.artist} · {queue.current.album}</div>
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
