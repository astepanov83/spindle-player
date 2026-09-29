<!-- The Queue part while radio plays: the station's recent songs, newest first,
     under a row that gives the player back to the queue (decision 147). -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte'
  import { player } from '../stores/player.svelte'
  import { playing } from '../stores/playing.svelte'
  import { queue } from '../stores/queue.svelte'
  import { radio } from '../stores/radio.svelte'
  import { backNote, recentRows } from '../radio/logic'

  // player.playing is radio's wish for sound while radio plays
  const rows = $derived(
    recentRows(radio.history, player.playing ? radio.title : undefined, Date.now())
  )
  const note = $derived(backNote(queue.from, queue.items.length))
</script>

<div class="body">
  <!-- the note on its own line: a column is too narrow for a long album name -->
  <button class="back" title={note} onclick={() => playing.backToQueue()}>
    <Icon name="back" size={18} />
    <span class="qt"><span class="bt">Back to queue</span><span class="ar">{note}</span></span>
  </button>
  {#if !rows.length}
    <p class="empty">Songs this station plays show up here.</p>
  {/if}
  {#each rows as r (r.key)}
    <!-- 032 puts the song's cover in front of the text -->
    <div class="rrow" class:cur-row={r.now}>
      <span class="t">{r.time}</span>
      <span class="qt">
        <span class="nm" title={r.song}>{r.song}</span>
        {#if r.artist}<span class="ar" title={r.artist}>{r.artist}</span>{/if}
      </span>
      {#if r.now}<span class="now">Now</span>{/if}
    </div>
  {/each}
</div>

<style>
  .body {
    flex: 1;
    overflow: auto;
    padding: 4px 8px 12px;
    min-height: 0;
  }
  .back {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    margin-bottom: 4px;
    border-radius: 10px;
    text-align: left;
    color: var(--ink-2);
    min-width: 0;
  }
  .back:hover {
    background: var(--hover);
    color: var(--ink);
  }
  .bt {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
  }
  .empty {
    margin: 12px;
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--ink-3);
  }
  .rrow {
    height: 56px;
    display: grid;
    grid-template-columns: 48px 1fr auto;
    gap: 10px;
    align-items: center;
    padding: 8px 12px;
    border-radius: 10px;
  }
  /* what plays now, tinted like the queue's current song */
  .rrow.cur-row {
    background: color-mix(in srgb, var(--c2) 26%, var(--hover));
    box-shadow: inset 3px 0 0 var(--c2);
  }
  .t {
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
    font-size: 13px;
  }
  .qt {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .nm {
    font-size: 15px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ar {
    font-size: 13px;
    color: var(--ink-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cur-row .nm {
    font-weight: 600;
    color: var(--ink);
  }
  .now {
    font-size: 12px;
    color: var(--ink-2);
  }
</style>
