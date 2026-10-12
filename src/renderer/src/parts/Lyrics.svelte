<!-- The song's words (ticket 120). Synced words: the line being sung bright
     and larger, kept in the middle as the song goes; a click on a line goes
     there. Plain words: one block to scroll, nothing lit. Instrumental (the
     online lookup says so, ticket 121): one quiet line.
     size: 'block' a few lines (Focus), 'fill' all the room it gets (Studio's
     player column, beside wide Focus's stage), 'page' large type over the library (Classic). -->
<script lang="ts">
  import { lineAt } from '../../../shared/lyrics'
  import { lyrics } from '../stores/lyrics.svelte'
  import { player } from '../stores/player.svelte'
  import { queues } from '../stores/queues.svelte'
  import { songTime } from './lyrics-time'

  let { size }: { size: 'block' | 'fill' | 'page' } = $props()

  const words = $derived(lyrics.words)
  const synced = $derived(words && 'synced' in words ? words.synced : undefined)

  // the song's time, run on between the player's ticks while playing
  let t = $state(0)
  $effect(() => {
    const pos = player.pos
    const playing = player.playing
    const at = performance.now()
    t = pos
    if (!playing || !synced) return
    let frame = requestAnimationFrame(function tick(now) {
      t = songTime(pos, at, now, true)
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  })
  const at = $derived(synced ? lineAt(synced, t) : -1)

  // The list moves so the lit line sits in the middle; before the first
  // line, the first one does.
  let boxHeight = $state(0)
  let lines: HTMLElement[] = $state([])
  let shift = $state(0)
  $effect(() => {
    const el = lines[Math.max(0, at)]
    if (!el || !boxHeight) return
    shift = Math.round(boxHeight / 2 - (el.offsetTop + el.offsetHeight / 2))
  })
  // a new song starts at its top, with no slide from the last one's place
  let still = $state(true)
  $effect(() => {
    void words
    still = true
    const f = requestAnimationFrame(() => requestAnimationFrame(() => (still = false)))
    return () => cancelAnimationFrame(f)
  })
</script>

{#if synced}
  <!-- the lines are for the mouse: the seek bar and arrows seek from the keyboard -->
  <div class="lyr synced {size}" role="region" aria-label="Lyrics" bind:clientHeight={boxHeight}>
    <div class="lines" class:still style:transform="translateY({shift}px)">
      {#each synced as line, i (i)}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
        <p
          class:now={i === at}
          class:past={i < at}
          class:gap={!line.text}
          bind:this={lines[i]}
          onclick={() => queues.seek(line.t)}
        >
          {line.text || '♪'}
        </p>
      {/each}
    </div>
  </div>
{:else if words && 'plain' in words}
  <!-- a Tab stop, so the keys scroll it -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="lyr plain {size}" role="region" aria-label="Lyrics" tabindex="0">
    {words.plain}
  </div>
{:else if words && 'instrumental' in words}
  <div class="lyr instrumental {size}" role="region" aria-label="Lyrics">
    <p>♪ Instrumental</p>
  </div>
{/if}

<style>
  .lyr {
    --line: 1.45em;
    position: relative;
    min-height: 0;
    width: 100%;
    max-width: var(--content-max, none);
    margin-inline: auto;
    text-align: center;
    font-size: var(--text-l);
    color: var(--ink-2);
  }
  .synced {
    overflow: hidden;
    /* the lines fade out at the top and bottom edges */
    mask-image: linear-gradient(transparent, #000 22%, #000 78%, transparent);
  }
  /* a few lines under the cover: five, or three in a short window */
  .block {
    flex: none;
    height: calc(var(--lines, 5) * var(--line) + 1.2em);
  }
  .fill,
  .page {
    flex: 1;
  }
  .fill {
    font-size: var(--title-s);
  }
  .page {
    font-size: var(--title-m);
    font-weight: 600;
  }
  .lines {
    transition: transform 0.45s cubic-bezier(0.25, 0.8, 0.3, 1);
    will-change: transform;
  }
  .still {
    transition: none;
  }
  p {
    margin: 0;
    padding: 0.12em 12px;
    line-height: 1.3;
    text-wrap: balance;
    cursor: pointer;
    opacity: 0.7;
    transform-origin: center;
    transition:
      opacity 0.3s,
      color 0.3s,
      transform 0.3s;
  }
  p:hover {
    opacity: 0.9;
  }
  .past {
    opacity: 0.5;
  }
  .gap {
    opacity: 0.3;
  }
  /* the album's accent, mixed into the ink so it reads on any cover */
  p.now {
    opacity: 1;
    color: color-mix(in oklch, var(--c2) 30%, var(--ink));
    font-weight: 600;
    transform: scale(1.12);
  }
  .page p.now {
    font-weight: 700;
    transform: scale(1.06);
  }
  .plain {
    overflow: auto;
    white-space: pre-line;
    line-height: 1.6;
    padding: 12px;
    color: var(--ink);
  }
  .plain.block {
    flex: none;
    height: calc(var(--lines, 5) * 1.6em + 24px);
  }
  .plain:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
    border-radius: 6px;
  }
  .instrumental {
    display: grid;
    place-items: center;
  }
  .instrumental.block {
    flex: none;
    height: calc(2 * var(--line));
  }
  .instrumental p {
    cursor: default;
    opacity: 0.7;
  }
  @media (prefers-reduced-motion: reduce) {
    .lines,
    p {
      transition: none;
    }
  }
</style>
