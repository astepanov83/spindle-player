<!-- The title over a list view (Albums, Artists, Playlists, Radio), in the
     look of the song table's: every view in both templates has one. A choice
     sits over the count: a few options as segments, more (a sort) as a
     button that opens a menu. -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import Seg from '../ui/Seg.svelte'
  import { menu } from '../stores/menu.svelte'

  let {
    title,
    meta = 'Library',
    count,
    hint,
    below,
    choice,
    onchoose
  }: {
    title: string
    meta?: string
    // "8 albums", on the right
    count: string
    // a line under the title
    hint?: string
    // a line of links under the title, in place of `hint`
    below?: Snippet
    // what the list shows ("Album artists | All artists") or how it sorts,
    // over the count it changes; `menu`: a button with a menu, for many options
    choice?: {
      label: string
      value: string
      options: { value: string; label: string }[]
      menu?: { prefix: string }
    }
    onchoose?: (value: string) => void
  } = $props()

  const picked = $derived(choice?.options.find((o) => o.value === choice.value)?.label ?? '')

  function open(e: MouseEvent): void {
    if (!choice) return
    menu.showFor(e, [
      { heading: choice.label },
      ...choice.options.map((o) => ({
        label: o.label,
        checked: o.value === choice.value,
        run: () => onchoose?.(o.value)
      }))
    ])
  }
</script>

<div class="vhead">
  <div>
    <div class="page-meta">{meta}</div>
    <h2 class="page-title">{title}</h2>
    {#if below}{@render below()}{:else if hint}<div class="page-meta">{hint}</div>{/if}
  </div>
  <div class="side">
    {#if choice?.menu}
      <button
        class="pick chip"
        aria-haspopup="menu"
        aria-label="{choice.label}: {picked}"
        title={choice.label}
        onclick={open}
        ><span class="prefix">{choice.menu.prefix}</span>
        {picked}<span class="arrow">▾</span></button
      >
    {:else if choice}
      <Seg
        small
        label={choice.label}
        options={choice.options}
        value={choice.value}
        onchange={(v) => onchoose?.(v)}
      />
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
  .side {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 10px;
  }
  .count {
    white-space: nowrap;
  }
  .pick {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    font-size: var(--text-xs);
    white-space: nowrap;
  }
  .prefix {
    color: var(--ink-3);
  }
  .arrow {
    font-size: 10px;
    margin-left: 2px;
  }
</style>
