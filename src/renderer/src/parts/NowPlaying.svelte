<script lang="ts">
  import PlayingText from './PlayingText.svelte'
  import Cover from '../ui/Cover.svelte'
  import Stage from '../visualizer/Stage.svelte'
  import { layout } from '../stores/layout.svelte'
  import { queues } from '../stores/queues.svelte'
  import { settings } from '../stores/settings.svelte'
  import { plugins } from '../../../shared/plugins'
  import { startHint } from './start-hint'

  // show: only the stage or only the words (Focus's wide layout); both when
  // left out. 'line': a small cover and two lines, no stage (Mini)
  let { style, show }: { style: 'panel' | 'full' | 'line'; show?: 'stage' | 'text' } = $props()

  const hint = $derived(
    startHint({
      anyPluginOn: plugins.some((p) => settings.plugins[p.id]),
      hasLibrary: layout.hasLibrary,
      firstPlugin: plugins[0].id
    })
  )
</script>

{#if style === 'line'}
  <div class="np-line">
    <div class="cv"><Cover src={queues.art?.cover} art={queues.art} /></div>
    <div class="line-meta">
      {#if queues.title}
        <div class="song-title" title={queues.title}><PlayingText line="title" /></div>
        <div class="song-sub" title={queues.sub}><PlayingText line="sub" /></div>
      {:else}
        <div class="song-title">Nothing playing</div>
        <!-- no room for its button: Settings is in the menu -->
        <div class="song-sub" title={hint.text}>{hint.text}</div>
      {/if}
    </div>
  </div>
{:else}
  <div class="np {style}" class:only-text={show === 'text'}>
    {#if show !== 'text'}
      <Stage />
    {/if}
    {#if show !== 'stage'}
      <div class="meta">
        {#if queues.title}
          <!-- a long line is cut: the tooltip has it whole -->
          <div class="song-title" title={queues.title}><PlayingText line="title" /></div>
          <div class="song-sub" title={queues.sub}><PlayingText line="sub" /></div>
        {:else}
          <div class="song-title">Nothing playing</div>
          <div class="song-sub">{hint.text}</div>
          {#if hint.settings}
            {@const section = hint.settings}
            <button class="chip open" onclick={() => layout.openSettings(section)}
              >Open Settings</button
            >
          {/if}
        {/if}
      </div>
    {/if}
  </div>
{/if}

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
    width: 100%;
    max-width: var(--content-max, none);
    margin-inline: auto;
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
  /* the words alone sit right above the controls */
  .only-text {
    justify-content: flex-end;
  }
  .full .song-title {
    font-size: var(--title-l);
  }

  .np-line {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    min-height: 0;
    padding: 8px 0 8px 8px;
  }
  /* as tall as the bar lets it be */
  .cv {
    height: 100%;
    aspect-ratio: 1;
    min-height: 0;
    flex: none;
    border-radius: 5px;
    overflow: hidden;
    box-shadow: 0 3px 10px var(--shadow);
  }
  .line-meta {
    min-width: 0;
    flex: 1;
  }
  .line-meta .song-title {
    font-size: var(--title-s);
  }
  .line-meta .song-sub {
    font-size: var(--text-s);
  }
</style>
