<!-- The title over a list view (Albums, Artists, Playlists, Radio), in the
     look of the song table's: every view in both templates has one. -->
<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    title,
    meta = 'Library',
    count,
    hint,
    below
  }: {
    title: string
    meta?: string
    // "8 albums", on the right
    count: string
    // a line under the title
    hint?: string
    // a line of links under the title, in place of `hint`
    below?: Snippet
  } = $props()
</script>

<div class="vhead">
  <div>
    <div class="page-meta">{meta}</div>
    <h2 class="page-title">{title}</h2>
    {#if below}{@render below()}{:else if hint}<div class="page-meta">{hint}</div>{/if}
  </div>
  <div class="page-meta count">{count}</div>
</div>

<style>
  .vhead {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 16px;
  }
  .count {
    white-space: nowrap;
  }
</style>
