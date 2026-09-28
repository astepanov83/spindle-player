<script lang="ts">
  import Cover from '../ui/Cover.svelte'
  import IconButton from '../ui/IconButton.svelte'
  import Slot from '../layout/Slot.svelte'
  import Stage from '../visualizer/Stage.svelte'
  import Seek from './Seek.svelte'
  import Transport from './Transport.svelte'
  import Volume from './Volume.svelte'
  import { fmtTime } from '../format'
  import { layout } from '../stores/layout.svelte'
  import { player } from '../stores/player.svelte'
  import { queue } from '../stores/queue.svelte'
  import { settings } from '../stores/settings.svelte'

  let { style }: { style: 'stack' | 'bar' } = $props()
</script>

{#snippet vizButton()}
  <IconButton
    icon="viz"
    label="Change visualizer"
    on={settings.visualizer !== 'off'}
    onclick={() => layout.cycleVisualizer()}
  />
{/snippet}

{#if style === 'bar'}
  <div class="ctl bar">
    <div class="bl">
      <div class="minicv"><Cover src={queue.currentAlbum?.cover} /></div>
      <div class="meta">
        {#if queue.current}
          <div class="song-title">{queue.current.title}</div>
          <div class="song-sub">{queue.current.artist} · {queue.current.album}</div>
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
      <Volume width={80} />
      {@render vizButton()}
      <Slot name="player.buttons" />
    </div>
  </div>
{:else}
  <div class="ctl stack">
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
        {@render vizButton()}
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
    font-size: 12px;
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
    font-size: 16px;
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
    font-size: 12px;
    color: var(--ink-2);
    font-variant-numeric: tabular-nums;
  }
  .br {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }
  .br > :global(.vstage) {
    width: 120px;
    height: 48px;
    flex: none;
  }
</style>
