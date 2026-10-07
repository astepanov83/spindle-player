<!-- A changes block: one row per change, what it was, an arrow, what it is
     now (names that open their page), and the button that undoes it. -->
<script lang="ts">
  import type { PluginId } from '../../../shared/plugins'
  import { actOnPage, openFrom } from '../plugins'
  import type { ChangesBlock } from '../plugins/types'
  import GoLink from '../ui/GoLink.svelte'

  let { block: b, tab, plugin }: { block: ChangesBlock; tab: string; plugin: PluginId } = $props()

  let list: HTMLUListElement | undefined = $state()
  // The row whose button was pressed: once it is gone (the change is undone
  // and the list comes back without it), focus goes to the row now in its place.
  let pressed: { key: string; at: number } | null = null

  $effect(() => {
    const rows = b.rows
    if (!pressed || rows.some((r) => r.key === pressed!.key)) return
    const buttons = list?.querySelectorAll('button')
    buttons?.[Math.min(pressed.at, buttons.length - 1)]?.focus()
    pressed = null
  })

  function press(r: ChangesBlock['rows'][number], at: number): void {
    pressed = { key: r.key, at }
    actOnPage(plugin, b.id, r.action.id, r.action.value)
  }
</script>

<ul class="changes" aria-label={b.label} bind:this={list}>
  {#each b.rows as r, i (r.key)}
    <li>
      <span class="what">
        <span class="from">{r.from}</span>
        <span class="arrow" aria-hidden="true">→</span>
        <span class="sr">to</span>
        <span class="to"
          >{#each r.to as p, i (i)}{#if p.to}{@const to = p.to}<GoLink go={() => openFrom(tab, to)}
                >{p.text}</GoLink
              >{:else}{p.text}{/if}{/each}</span
        >
      </span>
      <button class="pill ghost sm" aria-label={r.action.hint} onclick={() => press(r, i)}
        >{r.action.label}</button
      >
    </li>
  {/each}
</ul>

<style>
  .changes {
    list-style: none;
    margin: 0 0 22px;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 12px;
    min-height: 40px;
    border-radius: 8px;
  }
  li:hover {
    background: var(--hover);
  }
  li + li {
    box-shadow: 0 -1px 0 var(--edge);
  }
  .what {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 8px;
    font-size: var(--text-m);
    overflow-wrap: anywhere;
  }
  /* the tag as written, quieter than what it shows as now */
  .from {
    color: var(--ink-2);
  }
  .arrow {
    color: var(--ink-3);
  }
  .to {
    color: var(--ink);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .sm {
    flex: none;
    padding: 5px 12px;
    font-size: var(--text-s);
  }
</style>
