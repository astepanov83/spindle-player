<script lang="ts">
  import Lyrics from './Lyrics.svelte'
  import PlayingText from './PlayingText.svelte'
  import { openPlayingMenu } from './playing-menu'
  import Cover from '../ui/Cover.svelte'
  import Icon from '../ui/Icon.svelte'
  import Marquee from '../ui/Marquee.svelte'
  import Stage from '../visualizer/Stage.svelte'
  import { layout } from '../stores/layout.svelte'
  import { lyrics as words } from '../stores/lyrics.svelte'
  import { queues } from '../stores/queues.svelte'
  import { settings } from '../stores/settings.svelte'
  import { sleep } from '../stores/sleep.svelte'
  import { plugins } from '../../../shared/plugins'
  import { startHint } from './start-hint'

  // show: only the stage or only the words (Focus's wide layout); both when
  // left out. 'line': a small cover and two lines, no stage (Mini).
  // lyrics: the song's words show here while turned on (ticket 120): in place
  // of the stage in a panel, a few lines above the title when full, the
  // room above the title beside the stage. An instrumental song keeps the
  // stage in a panel (ticket 121).
  let {
    style,
    show,
    lyrics = false
  }: { style: 'panel' | 'full' | 'line'; show?: 'stage' | 'text'; lyrics?: boolean } = $props()

  const withWords = $derived(lyrics && words.showing)

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
    <!-- the whole bar's width: Controls.svelte draws over it while the
         pointer is on the bar. Too long, it scrolls. -->
    <div class="line-meta mini-rest">
      {#if queues.title}
        <div class="song-title">
          <Marquee run={!layout.barHot}><PlayingText line="title" /></Marquee>
        </div>
        <div class="song-sub">
          <Marquee run={!layout.barHot}><PlayingText line="sub" /></Marquee>
        </div>
      {:else}
        <div class="song-title">Nothing playing</div>
        <!-- no room for its button: Settings is in the menu -->
        <div class="song-sub"><Marquee run={!layout.barHot}>{hint.text}</Marquee></div>
      {/if}
    </div>
    {#if sleep.shown}
      <!-- the controls are out of sight: the sound will stop, so say so -->
      <span class="line-moon mini-rest" title="Sleep timer set"
        ><Icon name="moonOn" size={14} /></span
      >
    {/if}
  </div>
{:else}
  <div class="np {style}" class:only-text={show === 'text'}>
    {#if withWords && style === 'panel' && !words.instrumental}
      <Lyrics size="fill" />
    {:else if show !== 'text'}
      <Stage />
    {/if}
    {#if withWords && style === 'full'}
      <!-- beside the stage (wide Focus) the column has room for more -->
      <Lyrics size={show === 'text' ? 'fill' : 'block'} />
    {/if}
    {#if show !== 'stage'}
      <!-- a right click is the song menu (ticket 127); the keys have I for Song info -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="meta" oncontextmenu={openPlayingMenu}>
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
  /* Focus: three lines of words in a short window, up to five in a tall one */
  .full {
    container-type: size;
  }
  .full > :global(.lyr) {
    --lines: 3;
  }
  @container (min-height: 480px) {
    .full > :global(.lyr) {
      --lines: 4;
    }
  }
  @container (min-height: 600px) {
    .full > :global(.lyr) {
      --lines: 5;
    }
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
    padding: 8px 12px 8px 8px;
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
  /* Marquee cuts and scrolls a long line itself, and its edge fade starts
     a little left of the line */
  .line-meta :is(.song-title, .song-sub) {
    overflow: visible;
  }
  .line-moon {
    flex: none;
    align-self: flex-start;
    margin-top: 4px;
    color: var(--c2);
  }
</style>
