<!-- The A-Z strip on the right of a grid or list with letter or artist
     headings (ticket 096): # and A-Z always, the empty ones dim, then the
     other letters in the list's order. A click goes to that letter. -->
<script lang="ts">
  import { stripLetters, type Run } from '../library/groups'

  let {
    runs,
    scrollEl,
    go
  }: {
    runs: readonly Run[]
    scrollEl: HTMLElement | undefined
    go: (letter: string) => void
  } = $props()

  // the library's size: the strip goes under 520px (ticket 043's narrow
  // widths), and scrolls when its letters don't fit the height
  let boxWidth = $state(0)
  let boxHeight = $state(0)
  $effect(() => {
    const el = scrollEl
    if (!el) return
    const sizes = new ResizeObserver(() => {
      boxWidth = el.getBoundingClientRect().width
      boxHeight = el.clientHeight
    })
    sizes.observe(el)
    return () => sizes.disconnect()
  })

  const strip = $derived(boxWidth >= 520 ? stripLetters(runs) : undefined)
</script>

<!-- comes before the list in the page, so Tab reaches it without going
     through every row; CSS order keeps it on the right -->
{#if strip}
  <nav
    class="strip"
    aria-label="Go to letter"
    style:max-height="calc({boxHeight - 8}px - var(--vhead-h))"
  >
    {#each strip as s (s.letter)}
      <button
        disabled={!s.has}
        aria-label={s.letter === '#' ? 'Numbers and symbols' : s.letter}
        onclick={() => go(s.letter)}>{s.letter}</button
      >
    {/each}
  </nav>
{/if}

<style>
  /* stays in view while the list scrolls under it */
  .strip {
    order: 1;
    position: sticky;
    /* under the title row while it sticks */
    top: max(4px, calc(var(--vhead-h) - var(--scroll-pad-top, 20px) + 4px));
    align-self: flex-start;
    overflow-y: auto;
    scrollbar-width: none;
    display: flex;
    flex-direction: column;
    margin-right: -10px;
  }
  button {
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
    padding: 2px 4px;
    min-width: 18px;
    color: var(--ink-2);
    border-radius: 4px;
  }
  button:hover:not(:disabled) {
    color: var(--ink);
    background: var(--field);
  }
  button:disabled {
    color: var(--ink-3);
    opacity: 0.4;
  }
</style>
