<!-- The title over a list view (Albums, Artists, Playlists, Radio), in the
     look of the song table's: every view in both templates has one. A view
     that sorts more than one way has a sort button next to its count. -->
<script lang="ts">
  import { menu } from '../stores/menu.svelte'

  let {
    title,
    meta = 'Library',
    count,
    hint,
    sort,
    onsort
  }: {
    title: string
    meta?: string
    // "8 albums", on the right
    count: string
    // a line under the title
    hint?: string
    // the ways it sorts, the one picked, and what the menu is called
    sort?: { label: string; options: { id: string; label: string }[]; picked: string }
    onsort?: (id: string) => void
  } = $props()

  const picked = $derived(sort?.options.find((o) => o.id === sort.picked)?.label ?? '')

  function open(e: MouseEvent): void {
    if (!sort) return
    menu.showFor(e, [
      { heading: sort.label },
      ...sort.options.map((o) => ({
        label: o.label,
        checked: o.id === sort.picked,
        run: () => onsort?.(o.id)
      }))
    ])
  }
</script>

<div class="vhead">
  <div>
    <div class="page-meta">{meta}</div>
    <h2 class="page-title">{title}</h2>
    {#if hint}<div class="page-meta">{hint}</div>{/if}
  </div>
  <div class="end">
    {#if sort}
      <button
        class="sort chip"
        aria-haspopup="menu"
        aria-label="{sort.label}: {picked}"
        title={sort.label}
        onclick={open}><span class="by">Sort:</span> {picked}<span class="arrow">▾</span></button
      >
    {/if}
    <div class="page-meta count">{count}</div>
  </div>
</div>

<style>
  .vhead {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 16px;
  }
  .end {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .count {
    white-space: nowrap;
  }
  .sort {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    font-size: var(--text-xs);
    white-space: nowrap;
  }
  .by {
    color: var(--ink-3);
  }
  .arrow {
    font-size: 10px;
    margin-left: 2px;
  }
</style>
