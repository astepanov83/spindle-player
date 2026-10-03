<!-- A live item's status next to the dot (LIVE, CONNECTING, BUFFERING,
     RECONNECTING, STOPPED; decision 163) and the time listened. The plugin
     says the status; the core counts the time. -->
<script lang="ts">
  import { fmtClock } from '../format'
  import { queues } from '../stores/queues.svelte'
  import { liveWord, liveWords, statusTip } from '../queue/bar'

  // the time listened and a retry's wait move on their own, so a tick redraws them
  let now = $state(Date.now())
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000)
    return () => clearInterval(t)
  })
  const word = $derived(liveWord(queues.live.status))
  const listened = $derived(fmtClock(queues.live.listened(now) / 1000))
</script>

<span class="status {word}" title={statusTip(queues.live.status, now)}>
  <span class="dot">●</span>
  <!-- every word in one cell, so the space fits the widest and nothing moves -->
  <span class="words" aria-live="polite">
    {#each Object.entries(liveWords) as [s, w] (s)}
      <span class:shown={s === word}>{w}</span>
    {/each}
  </span>
</span>
<!-- stopped: hidden, not gone, so a choice next to it stays put; Play goes on counting -->
<span class="time" class:off={word === 'off'} title="Time listened">{listened}</span>

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
</style>
