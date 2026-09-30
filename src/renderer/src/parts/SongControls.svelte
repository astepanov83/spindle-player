<script lang="ts">
  import Cover from '../ui/Cover.svelte'
  import Slot from '../layout/Slot.svelte'
  import Stage from '../visualizer/Stage.svelte'
  import PlayingText from './PlayingText.svelte'
  import Seek from './Seek.svelte'
  import TabLine from './TabLine.svelte'
  import Transport from './Transport.svelte'
  import VizButton from './VizButton.svelte'
  import Volume from './Volume.svelte'
  import { fmtTime } from '../format'
  import { player } from '../stores/player.svelte'
  import { playing } from '../stores/playing.svelte'

  let { style }: { style: 'stack' | 'bar' } = $props()
</script>

{#if style === 'bar'}
  <div class="ctl bar">
    <div class="bl">
      <div class="minicv"><Cover src={playing.art?.cover} /></div>
      <div class="meta">
        {#if playing.title}
          <div class="song-title" title={playing.title}><PlayingText line="title" /></div>
          <div class="song-sub" title={playing.sub}><PlayingText line="sub" /></div>
        {:else}
          <div class="song-title">Nothing playing</div>
        {/if}
      </div>
    </div>
    <div class="bc">
      <Transport />
      <div class="seekrow">
        <span>{fmtTime(player.pos)}</span><Seek /><span>{fmtTime(player.duration)}</span>
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
  <div class="ctl stack">
    <TabLine />
    <div>
      <Seek />
      <div class="times">
        <span>{fmtTime(player.pos)}</span><span>{fmtTime(player.duration)}</span>
      </div>
    </div>
    <Transport />
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
  .stack {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 22px 18px;
  }
  .times {
    display: flex;
    justify-content: space-between;
    font-size: var(--text-xs);
    color: var(--ink-2);
    font-variant-numeric: tabular-nums;
    margin-top: 2px;
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
  }
  .song-title {
    font-size: var(--title-s);
  }
  .bc {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: center;
  }
  .bc > :global(.transport) {
    gap: 14px;
    justify-content: center;
  }
  .seekrow {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    font-size: var(--text-xs);
    color: var(--ink-2);
    font-variant-numeric: tabular-nums;
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
