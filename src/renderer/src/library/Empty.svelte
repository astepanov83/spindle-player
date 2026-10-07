<script lang="ts">
  import type { Snippet } from 'svelte'

  // `children`: buttons under the text ('Search your library for "har"')
  let { title, text, children }: { title: string; text: string; children?: Snippet } = $props()
</script>

<div class="empty">
  <b>{title}</b>{text}
  {#if children}<div class="acts">{@render children()}</div>{/if}
</div>

<style>
  .empty {
    color: var(--ink-3);
    font-size: var(--text-m);
    line-height: 1.6;
    padding: 30px 0;
    max-width: 44ch;
  }
  b {
    color: var(--ink);
    display: block;
    font-size: var(--title-s);
    margin-bottom: 4px;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
  }
</style>
