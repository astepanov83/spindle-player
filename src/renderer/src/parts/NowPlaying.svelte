<script lang="ts">
  import PlayingText from './PlayingText.svelte'
  import Stage from '../visualizer/Stage.svelte'
  import { layout } from '../stores/layout.svelte'
  import { queues } from '../stores/queues.svelte'
  import { settings } from '../stores/settings.svelte'
  import { plugins } from '../../../shared/plugins'
  import { startHint } from './start-hint'

  let { style }: { style: 'panel' | 'full' } = $props()

  const hint = $derived(
    startHint({
      anyPluginOn: plugins.some((p) => settings.plugins[p.id]),
      hasLibrary: layout.hasLibrary
    })
  )
</script>

<div class="np {style}">
  <Stage />
  <div class="meta">
    {#if queues.title}
      <!-- a long line is cut: the tooltip has it whole -->
      <div class="song-title" title={queues.title}><PlayingText line="title" /></div>
      <div class="song-sub" title={queues.sub}><PlayingText line="sub" /></div>
    {:else}
      <div class="song-title">Nothing playing</div>
      <div class="song-sub">{hint.text}</div>
      {#if hint.settings}
        <button class="chip open" onclick={() => (layout.settingsOpen = true)}>Open Settings</button
        >
      {/if}
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
    font-size: var(--title-m);
  }
  .full .meta {
    text-align: center;
  }
  .open {
    margin-top: 10px;
  }
  .full .song-title {
    font-size: var(--title-l);
  }
</style>
