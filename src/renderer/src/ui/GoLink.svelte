<!-- A name that opens its page in the library (ticket 040). Plain text where
     there is nothing to open, or no library to open it in (Focus). -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { layout } from '../stores/layout.svelte'

  let { go, children }: { go?: () => void; children: Snippet } = $props()

  // Enter only: Space plays and pauses everywhere (decision 168)
  function onkeydown(e: KeyboardEvent): void {
    if (e.key !== 'Enter') return
    e.preventDefault()
    go?.()
  }
</script>

<!-- a span, not a button: a button can't be cut with an ellipsis inside a line -->
{#if go && layout.hasLibrary}
  <span class="golink" role="link" tabindex="0" onclick={go} {onkeydown}>{@render children()}</span>
{:else}
  {@render children()}
{/if}

<style>
  .golink {
    cursor: pointer;
    border-radius: 3px;
  }
  .golink:hover {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 0.15em;
  }
  /* The outline comes from theme.css. A line cut with an ellipsis clips
     it, so a 2px underline in the focus color marks the link too. */
  .golink:focus-visible {
    outline-offset: 1px;
    box-shadow: none;
    text-decoration: underline 2px var(--focus);
    text-underline-offset: 0.15em;
  }
</style>
