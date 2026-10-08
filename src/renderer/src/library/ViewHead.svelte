<!-- The title row over a list view (Albums, Artists, Songs, Playlists,
     Radio), on one line: the title, its count, then at the right the look
     switch (icon segments) and a choice: a few options as segments, more (a
     sort) as a button that opens a menu. Where they don't fit beside the
     title (Studio's narrowest library), both go into one menu button
     (ticket 095). -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import Seg from '../ui/Seg.svelte'
  import type { IconName } from '../ui/icons'
  import { menu, type MenuEntry } from '../stores/menu.svelte'

  interface Choice {
    label: string
    value: string
    options: { value: string; label: string }[]
  }

  let {
    title,
    count,
    hint,
    below,
    choice,
    onchoose,
    looks,
    onlook
  }: {
    title: string
    // "8 albums": the row shows the number
    count: string
    // a line under the title
    hint?: string
    // a line of links under the title, in place of `hint`
    below?: Snippet
    // what the list shows ("Album artists | All artists") or how it sorts;
    // `menu`: a button with a menu, for many options
    choice?: Choice & { menu?: { prefix: string } }
    onchoose?: (value: string) => void
    // how the view is drawn: an icon per look
    looks?: Choice & { options: { value: string; label: string; icon: IconName }[] }
    onlook?: (value: string) => void
  } = $props()

  const number = $derived(count.split(' ')[0])

  // The widths the switch and the choice need, measured also while they are
  // hidden, so the row knows when they fit again.
  let rowW = $state(0)
  let leadW = $state(0)
  let sideW = $state(0)
  const fits = $derived(!looks || leadW + 10 + sideW <= rowW)
  const picked = $derived(choice?.options.find((o) => o.value === choice.value)?.label ?? '')

  const entries = (c: Choice, run: (v: string) => void): MenuEntry[] => [
    { heading: c.label },
    ...c.options.map((o) => ({
      label: o.label,
      checked: o.value === c.value,
      run: () => run(o.value)
    }))
  ]

  // the sort's menu; in a narrow row, the looks too
  function open(e: MouseEvent, withLooks: boolean): void {
    const out: MenuEntry[] = choice ? entries(choice, (v) => onchoose?.(v)) : []
    if (withLooks && looks) {
      if (out.length) out.push('line')
      out.push(...entries(looks, (v) => onlook?.(v)))
    }
    menu.showFor(e, out)
  }
</script>

{#snippet menuButton(withLooks: boolean)}
  <!-- a narrow row with no choice names the look -->
  {@const label = choice?.label ?? looks?.label ?? ''}
  {@const now = choice
    ? picked
    : (looks?.options.find((o) => o.value === looks.value)?.label ?? '')}
  <button
    class="pick chip"
    aria-haspopup="menu"
    aria-label="{label}: {now}"
    title={label}
    onclick={(e) => open(e, withLooks)}
    >{#if choice?.menu}<span class="prefix">{choice.menu.prefix}</span>
    {/if}{now}<span class="arrow">▾</span></button
  >
{/snippet}

<!-- The row sticks at the top while the view scrolls, so the sort and the
     look switch stay in reach; a line under it scrolls away. -->
<div class="vhead" class:tight={!!below || !!hint} data-sticky-top>
  <div class="titlerow" bind:clientWidth={rowW}>
    <div class="lead" class:fixed={!!looks} bind:clientWidth={leadW}>
      <h2 class="page-title" {title}>{title}</h2>
      <span class="n" aria-hidden="true" title={count}>{number}</span>
      <span class="sr">{count}</span>
    </div>
    {#if looks || choice}
      <div class="side" class:out={!fits} bind:clientWidth={sideW}>
        {#if looks}
          <Seg
            small
            label={looks.label}
            options={looks.options}
            value={looks.value}
            onchange={(v) => onlook?.(v)}
          />
        {/if}
        {#if choice?.menu}
          {@render menuButton(false)}
        {:else if choice}
          <Seg
            small
            label={choice.label}
            options={choice.options}
            value={choice.value}
            onchange={(v) => onchoose?.(v)}
          />
        {/if}
      </div>
    {/if}
    {#if !fits}
      <div class="side">{@render menuButton(true)}</div>
    {/if}
  </div>
</div>
{#if below}<div class="under">{@render below()}</div>{:else if hint}<div class="under page-meta">
    {hint}
  </div>{/if}

<style>
  /* It reaches up over the scroll box's top padding, so it sits still from
     the start and no row shows above it. */
  .vhead {
    position: sticky;
    top: calc(-1 * var(--scroll-pad-top, 20px));
    z-index: 2;
    margin-top: calc(-1 * var(--scroll-pad-top, 20px));
    padding: calc(var(--scroll-pad-top, 20px) + 6px) 0 16px;
    background: var(--bg);
  }
  .vhead.tight {
    padding-bottom: 8px;
  }
  .under {
    padding-bottom: 16px;
  }
  /* How much of the box's top the stuck row covers, for the parts that
     stick under it and the jumps that land under it. The row's height is
     set so this is known. */
  .vhead ~ :global(*) {
    --vhead-h: calc(var(--scroll-pad-top, 20px) + 62px);
  }
  .vhead.tight ~ :global(*) {
    --vhead-h: calc(var(--scroll-pad-top, 20px) + 54px);
  }
  .titlerow {
    position: relative;
    height: 40px;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .lead {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
  }
  /* its whole width, to know whether the switch fits beside it */
  .lead.fixed {
    flex: none;
  }
  .lead .page-title {
    margin: 0 0 6px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .n {
    flex: none;
    font-size: var(--title-s);
    font-weight: 600;
    color: var(--ink-3);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .side {
    flex: none;
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  /* not shown, but measured */
  .out {
    position: absolute;
    left: 0;
    top: 0;
    visibility: hidden;
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
