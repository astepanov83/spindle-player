<!-- Radio's controls: no seek, Next, Previous, Shuffle or Repeat (decision 150).
     The status (LIVE, CONNECTING, BUFFERING, RECONNECTING, STOPPED) and the time listened,
     the stream picker, stop and play, and Save. -->
<script lang="ts">
  import Cover from '../ui/Cover.svelte'
  import Icon from '../ui/Icon.svelte'
  import Slot from '../layout/Slot.svelte'
  import Stage from '../visualizer/Stage.svelte'
  import PlayButton from './PlayButton.svelte'
  import PlayingText from './PlayingText.svelte'
  import StreamPicker from './StreamPicker.svelte'
  import TabLine from './TabLine.svelte'
  import VizButton from './VizButton.svelte'
  import Volume from './Volume.svelte'
  import { fmtClock } from '../format'
  import { player } from '../stores/player.svelte'
  import { queues } from '../stores/queues.svelte'
  import { radio, type RadioStatus } from '../plugins/radio/store.svelte'

  let { style }: { style: 'stack' | 'bar' } = $props()

  // the time listened moves on its own, so a tick redraws it
  let now = $state(Date.now())
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000)
    return () => clearInterval(t)
  })
  const listened = $derived(fmtClock(radio.listened(now) / 1000))

  const label: Record<RadioStatus, string> = {
    off: 'STOPPED',
    connecting: 'CONNECTING',
    live: 'LIVE',
    buffering: 'BUFFERING',
    reconnecting: 'RECONNECTING'
  }
</script>

<!-- Stop, since it closes the connection; play opens a new one at the live edge.
     player.playing is radio's wish for sound while radio plays (radio.wanted isn't reactive). -->
{#snippet stopPlay()}
  <PlayButton
    icon={player.playing ? 'stop' : 'play'}
    label={player.playing ? 'Stop' : 'Play'}
    onclick={() => queues.togglePlay()}
  />
{/snippet}

{#snippet live()}
  <span class="status {radio.status}" title={radio.statusDetail(now)}>
    <span class="dot">●</span>
    <!-- every word in one cell, so the space fits the widest and nothing moves -->
    <span class="words" aria-live="polite">
      {#each Object.entries(label) as [s, word] (s)}
        <span class:shown={s === radio.status}>{word}</span>
      {/each}
    </span>
  </span>
  <!-- stopped: hidden, not gone, so the stream picker stays put; Play goes on counting -->
  <span class="time" class:off={radio.status === 'off'} title="Time listened">{listened}</span>
{/snippet}

<!-- The star alone in the stack, where the row has no room for the word;
     the same star as on the Radio list. -->
{#snippet save(word: boolean)}
  {#if radio.station && !radio.saved}
    <button
      class="save chip"
      class:icon={!word}
      title="Add to My stations"
      aria-label={word ? undefined : 'Add to My stations'}
      onclick={() => radio.save()}
      ><Icon name="star" size={16} />{#if word}Save{/if}</button
    >
  {/if}
{/snippet}

{#if style === 'bar'}
  <div class="ctl bar">
    <div class="bl">
      <div class="minicv"><Cover src={queues.art?.cover} /></div>
      <div class="meta">
        <!-- cut sooner when Save shows: the tooltip has it whole -->
        <div class="song-title" title={queues.title}><PlayingText line="title" /></div>
        <div class="song-sub" title={queues.sub}><PlayingText line="sub" /></div>
      </div>
      {@render save(true)}
    </div>
    <div class="bc">
      {@render stopPlay()}
      <div class="liverow">
        {@render live()}
        <StreamPicker short />
      </div>
    </div>
    <div class="br">
      <Stage cover={false} />
      <Volume width={80} pop />
      <VizButton />
      <Slot name="player.buttons" />
    </div>
  </div>
{:else}
  <!-- no station name: NowPlaying shows it right above, or TabLine while the Queue tab hides it -->
  <div class="ctl stack">
    <TabLine />
    <div class="liverow">
      {@render live()}
      <span class="gap"></span>
      <StreamPicker />
      {@render save(false)}
    </div>
    <div class="center">{@render stopPlay()}</div>
    <div class="btnrow">
      <Volume />
      <div class="right">
        <VizButton />
        <Slot name="player.buttons" />
      </div>
    </div>
  </div>
{/if}

<style>
  .status {
    display: inline-flex;
    align-items: center;
    gap: 0.3em;
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--ink-3);
    white-space: nowrap;
  }
  .words {
    display: inline-grid;
  }
  .words > span {
    grid-area: 1 / 1;
    visibility: hidden;
  }
  .words > .shown {
    visibility: visible;
  }
  .status:not(.off) {
    color: var(--ink);
  }
  /* red while sound comes out */
  .status.live .dot {
    color: var(--live);
  }
  .connecting .dot {
    color: var(--ink-3);
  }
  .buffering .dot,
  .reconnecting .dot {
    color: var(--warn);
  }
  /* a fade, not a movement, so it stays with reduced motion too */
  .connecting .dot,
  .buffering .dot,
  .reconnecting .dot {
    animation: pulse 0.9s ease-in-out infinite alternate;
  }
  @keyframes pulse {
    to {
      opacity: 0.2;
    }
  }
  .time {
    font-size: var(--text-xs);
    color: var(--ink-2);
    font-variant-numeric: tabular-nums;
  }
  .time.off {
    visibility: hidden;
  }
  .liverow {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .gap {
    flex: 1;
  }
  .save {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px 5px 9px;
    color: var(--ink);
    font-weight: 600;
    flex: none;
  }
  .save.icon {
    padding: 5px;
  }

  .stack {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 22px 18px;
  }
  .center {
    display: flex;
    justify-content: center;
  }
  .btnrow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .right {
    display: flex;
    gap: 2px;
    align-items: center;
  }

  .bar {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, 1fr);
    align-items: center;
    gap: 20px;
    padding: 0 18px;
    background: linear-gradient(
      90deg,
      color-mix(in oklch, var(--c1) calc(var(--tint) / 2), var(--bg-title)),
      var(--bg-title) 55%
    );
    --playbtn: 40px;
    --playico: 22px;
    --icobtn: 34px;
  }
  .bl {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }
  .minicv {
    width: 60px;
    height: 60px;
    border-radius: 6px;
    overflow: hidden;
    flex: none;
    box-shadow: 0 6px 16px var(--shadow);
  }
  .meta {
    min-width: 0;
    flex: 0 1 auto;
  }
  .song-title {
    font-size: var(--title-s);
  }
  .bc {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    min-width: 0;
  }
  /* Its width comes from the grid, not its buttons. As it gets narrower the
     stage shrinks, then goes, then Volume turns into a button (Volume.svelte). */
  .br {
    container: bar-end / inline-size;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }
  .br > :global(*) {
    flex: none;
  }
  .br > :global(.vstage) {
    flex: 0 1 120px;
    min-width: 0;
    height: 48px;
  }
  @container bar-end (max-width: 279px) {
    .br > :global(.vstage) {
      display: none;
    }
  }
</style>
