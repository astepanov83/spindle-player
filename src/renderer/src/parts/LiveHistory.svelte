<!-- The Queue part while a live item plays: the songs its plugin heard,
     newest first, under a row that gives the player back to the queue
     (decision 147). Drawn from the live queue's data; nothing can be moved,
     removed or played. -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte'
  import Thumb from '../ui/Thumb.svelte'
  import { infoOf } from '../plugins'
  import { player } from '../stores/player.svelte'
  import { queue } from '../stores/queue.svelte'
  import { queues } from '../stores/queues.svelte'
  import { backNote, historyRows, msToMidnight } from '../queue/history'

  // Today's times turn into days at midnight, with no new title to redraw them.
  let now = $state(Date.now())
  $effect(() => {
    let timer: ReturnType<typeof setTimeout>
    const tick = (): void => {
      now = Date.now()
      timer = setTimeout(tick, msToMidnight(now) + 1000)
    }
    timer = setTimeout(tick, msToMidnight(Date.now()) + 1000)
    return () => clearTimeout(timer)
  })

  // player.playing is the live item's wish for sound while it plays
  const rows = $derived(historyRows(queues.live.history, player.playing, now))
  const note = $derived(backNote(queue.from, queue.items.length))
  // the cover column shows only once a song has one (ticket 032): with the
  // setting off, rows keep their width for the text
  const thumbs = $derived(rows.some((r) => r.cover))
  // a song with no cover (a jingle, a miss) shows the item's own picture (a
  // station's logo), or the record
  const logo = $derived(infoOf(queues.live.current ?? undefined)?.art?.cover)
</script>

<div class="body">
  <!-- the note on its own line: a column is too narrow for a long album name -->
  <button class="back row" title={note} onclick={() => queues.backToQueue()}>
    <Icon name="back" size={18} />
    <span class="qt"><span class="bt">Back to queue</span><span class="ar">{note}</span></span>
  </button>
  {#if !rows.length}
    <p class="empty">Songs show up here as they play.</p>
  {/if}
  {#each rows as r (r.key)}
    <div class="rrow" class:cur-row={r.now} class:thumbs>
      <span class="t">{r.time}</span>
      {#if thumbs}
        <Thumb src={r.cover || logo} size={40} />
      {/if}
      <span class="qt">
        <span class="nm" title={r.title}>{r.title}</span>
        {#if r.subtitle}<span class="ar" title={r.subtitle}>{r.subtitle}</span>{/if}
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
    color: var(--ink-2);
    min-width: 0;
  }
  .back:hover {
    color: var(--ink);
  }
  .bt {
    font-size: var(--text-m);
    font-weight: 600;
    color: var(--ink);
  }
  .empty {
    margin: 12px;
    font-size: var(--text-s);
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
    border-radius: 8px;
  }
  .rrow.thumbs {
    grid-template-columns: 48px 40px 1fr auto;
  }
  .t {
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
    font-size: var(--text-s);
  }
  .qt {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .nm {
    font-size: var(--text-l);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ar {
    font-size: var(--text-s);
    color: var(--ink-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cur-row .nm {
    font-weight: 600;
    color: var(--ink);
  }
  .now {
    font-size: var(--text-xs);
    color: var(--ink-2);
  }
</style>
