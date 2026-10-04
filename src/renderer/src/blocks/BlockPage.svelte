<!-- A page of a plugin's tab: its blocks, each drawn by the core's view for
     its kind. Only the plugin's data differs from page to page. -->
<script lang="ts">
  import type { PluginId } from '../../../shared/plugins'
  import Empty from '../library/Empty.svelte'
  import { typedIn } from '../plugins'
  import type { Block, NavKind } from '../plugins/types'
  import { library } from '../stores/library.svelte'
  import Head from './Head.svelte'
  import Nothing from './Nothing.svelte'
  import Results from './Results.svelte'
  import Rows from './Rows.svelte'
  import Songs from './Songs.svelte'
  import Tiles from './Tiles.svelte'
  import Tree from './Tree.svelte'

  let {
    blocks,
    tab,
    plugin,
    scrollEl,
    nav
  }: {
    blocks: Block[]
    tab: string
    plugin: PluginId
    scrollEl: HTMLElement | undefined
    nav: NavKind
  } = $props()

  const lone = $derived(blocks.length === 1 && blocks[0].kind === 'empty' ? blocks[0] : undefined)

  // A block keeps its view while the page changes around it (a folder that
  // gets a path bar keeps its rows and their focus); grids of round and
  // square tiles are different lists.
  const keys = $derived.by(() => {
    const seen: Record<string, number> = {}
    return blocks.map((b) => {
      const kind = b.kind === 'tiles' && b.round ? 'round' : b.kind
      const n = (seen[kind] = (seen[kind] ?? -1) + 1)
      return `${kind} ${n}`
    })
  })

  // a gap between a list of rows and the songs under it
  const gapBefore = (i: number): boolean => {
    const above = blocks[i - 1]
    return above?.kind === 'rows' && above.items.length > 0
  }
  // a heading over rows, or over the line that says why there are none,
  // lines up with their text
  const overRows = (i: number): boolean => {
    const below = blocks[i + 1]
    return below?.kind === 'rows' || (below?.kind === 'empty' && !below.title)
  }
  const underHead = (i: number): boolean => blocks[i - 1]?.kind === 'head'
  // room under a page that ends in rows or a quiet line, as the Radio tab had
  const endRoom = $derived.by(() => {
    const last = blocks[blocks.length - 1]
    return last?.kind === 'rows' || (last?.kind === 'empty' && !last.title)
  })

  // the tab's plugin hears the search box (Radio asks Radio Browser)
  $effect(() => {
    typedIn(plugin, tab, library.query)
  })
</script>

{#if lone?.kind === 'empty'}
  <div class="fill"><Nothing block={lone} {plugin} /></div>
{:else}
  {#each blocks as b, i (keys[i])}
    {#if b.kind === 'head'}
      <Head block={b} {tab} {plugin} {nav} />
    {:else if b.kind === 'tiles'}
      <Tiles block={b} {tab} {plugin} {scrollEl} />
    {:else if b.kind === 'songs'}
      {#if gapBefore(i)}<div class="gap"></div>{/if}
      <Songs block={b} {plugin} {scrollEl} />
    {:else if b.kind === 'rows'}
      <Rows block={b} {tab} {plugin} {scrollEl} />
    {:else if b.kind === 'tree'}
      <Tree block={b} {tab} />
    {:else if b.kind === 'empty'}
      {#if b.title}<Empty title={b.title} text={b.text} />{:else}<p class="note">{b.text}</p>{/if}
    {:else if b.kind === 'text'}
      <h3 class="part section-label" class:over-rows={overRows(i)} class:top={underHead(i)}>
        {b.text}
      </h3>
    {:else}
      <Results block={b} {scrollEl} />
    {/if}
  {/each}
  {#if endRoom}<div class="end"></div>{/if}
{/if}

<style>
  .fill {
    min-height: 100%;
    display: flex;
    flex-direction: column;
  }
  .gap {
    height: 22px;
  }
  .end {
    height: 12px;
    flex-shrink: 0;
  }
  .part {
    margin: 0 0 14px;
  }
  .over-rows {
    margin: 14px 12px 6px;
  }
  .over-rows.top {
    margin-top: 4px;
  }
  /* one quiet line under a list: "No stations found." */
  .note {
    color: var(--ink-3);
    font-size: var(--text-m);
    line-height: 1.6;
    padding: 6px 12px;
    margin: 0;
    max-width: 52ch;
  }
</style>
