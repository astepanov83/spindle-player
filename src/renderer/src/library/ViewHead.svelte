<!-- The title over a list view (Albums, Artists, Playlists, Radio), in the
     look of the song table's: every view in both templates has one. -->
<script lang="ts">
  let {
    title,
    meta = 'Library',
    count,
    hint
  }: {
    title: string
    meta?: string
    // "8 albums", on the right
    count: string
    // a line under the title
    hint?: string
  } = $props()
</script>

<div class="vhead">
  <div>
    <div class="page-meta">{meta}</div>
    <h2 class="page-title">{title}</h2>
    {#if hint}<div class="page-meta">{hint}</div>{/if}
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
