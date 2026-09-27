<script lang="ts">
  import Stage from '../visualizer/Stage.svelte'
  import { queue } from '../stores/queue.svelte'

  let { style }: { style: 'panel' | 'full' } = $props()
</script>

<div class="np {style}">
  <Stage />
  <div class="meta">
    {#if queue.current}
      <div class="title">{queue.current.title}</div>
      <div class="sub">{queue.current.artist} · {queue.current.album}</div>
    {:else}
      <div class="title">Nothing playing</div>
      <div class="sub">Pick an album or a song to start</div>
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
  .title {
    font-family: var(--display);
    font-weight: 700;
    font-size: 21px;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sub {
    font-size: 13.5px;
    color: var(--ink-2);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .full .meta {
    text-align: center;
  }
  .full .title {
    font-size: 24px;
  }
</style>
