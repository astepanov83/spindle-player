<!-- One line of text that scrolls when it doesn't fit (Mini's title and
     artist): a wait, a slow scroll to its end, a wait, and back. Text that
     fits stays still. With reduced motion it stays still and fades out at
     the edge. Put it inside the element with the line's own style. -->
<script lang="ts">
  import type { Snippet } from 'svelte'

  // run: false holds it at its start (Mini while its controls show)
  let { children, run = true }: { children: Snippet; run?: boolean } = $props()

  const pxPerSec = 30
  const waitMs = 2000

  let box: HTMLElement
  let text: HTMLElement
  // how far the text goes past the box, in px
  let over = $state(0)

  $effect(() => {
    const measure = (): void => {
      over = Math.max(0, Math.ceil(text.scrollWidth - box.clientWidth))
    }
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    ro.observe(text)
    measure()
    return () => ro.disconnect()
  })

  $effect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!run || !over || reduced) return
    const go = (over / pxPerSec) * 1000
    const all = 2 * (waitMs + go)
    const at = (ms: number): number => ms / all
    const end = `translateX(${-over}px)`
    const a = text.animate(
      [
        { transform: 'none', offset: 0 },
        { transform: 'none', offset: at(waitMs) },
        { transform: end, offset: at(waitMs + go) },
        { transform: end, offset: at(2 * waitMs + go) },
        { transform: 'none', offset: 1 }
      ],
      { duration: all, iterations: Infinity, easing: 'ease-in-out' }
    )
    return () => a.cancel()
  })
</script>

<span class="mq" class:over={over > 0} bind:this={box}
  ><span class="text" bind:this={text}>{@render children()}</span></span
>

<style>
  .mq {
    display: block;
    overflow: hidden;
    white-space: nowrap;
  }
  /* Both cut ends fade out, so they read as more to come, not clipped
     words. The box starts the fade's width early, so the first letter is
     clear of it at the start, and the text ends that much late. */
  .mq.over {
    --fade: 12px;
    margin-left: calc(-1 * var(--fade));
    mask-image: linear-gradient(
      90deg,
      transparent,
      #000 var(--fade),
      #000 calc(100% - var(--fade)),
      transparent
    );
  }
  .text {
    display: inline-block;
  }
  .over .text {
    padding-inline: var(--fade);
  }
</style>
