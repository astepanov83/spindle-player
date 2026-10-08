<!-- A run of blocks, each drawn by the core's view for its kind: a whole
     page (BlockPage), or the right side of an artist's column look. -->
<script lang="ts">
  import type { PluginId } from '../../../shared/plugins'
  import Empty from '../library/Empty.svelte'
  import { actOnPage } from '../plugins'
  import type { ShownTab } from '../plugins/tabs'
  import type { Block, EmptyBlock, NavKind } from '../plugins/types'
  import AlbumSongs from './AlbumSongs.svelte'
  import Changes from './Changes.svelte'
  import Chips from './Chips.svelte'
  import Column from './Column.svelte'
  import Head from './Head.svelte'
  import List from './List.svelte'
  import Results from './Results.svelte'
  import Rows from './Rows.svelte'
  import Shelves from './Shelves.svelte'
  import SearchButtons from './SearchButtons.svelte'
  import Songs from './Songs.svelte'
  import Tiles from './Tiles.svelte'
  import Tree from './Tree.svelte'

  let {
    blocks,
    tab,
    plugin,
    scrollEl,
    nav,
    wider,
    headAbove = false
  }: {
    blocks: Block[]
    tab: string
    plugin: PluginId
    scrollEl: HTMLElement | undefined
    nav: NavKind
    // the other tabs that search wider (ticket 077)
    wider: ShownTab[]
    // the first block sits right under a head, beside it or above it
    headAbove?: boolean
  } = $props()

  const hasButtons = (b: EmptyBlock): boolean =>
    !!b.action || (!!b.nothingFound && wider.length > 0)

  // A block keeps its view while the page changes around it (a folder that
  // gets a path bar keeps its rows and their focus); grids of round and
  // square tiles are different lists.
  const keys = $derived.by(() => {
    const seen: Record<string, number> = {}
    return blocks.map((b) => {
      const kind = (b.kind === 'tiles' || b.kind === 'list') && b.round ? `round ${b.kind}` : b.kind
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
  const underHead = (i: number): boolean => (i === 0 ? headAbove : blocks[i - 1]?.kind === 'head')
</script>

{#snippet emptyButtons(b: EmptyBlock)}
  {#if b.action}
    {@const a = b.action}
    <button class="pill" onclick={() => actOnPage(plugin, b.id, a.id)}>{a.label}</button>
  {/if}
  {#if b.nothingFound}<SearchButtons tabs={wider} />{/if}
{/snippet}

{#each blocks as b, i (keys[i])}
  {#if b.kind === 'head'}
    <Head block={b} {tab} {plugin} {nav} />
  {:else if b.kind === 'column'}
    <Column block={b} {tab} {plugin} {scrollEl} {nav} {wider} />
  {:else if b.kind === 'tiles'}
    <Tiles block={b} {tab} {plugin} {scrollEl} />
  {:else if b.kind === 'list'}
    <List block={b} {tab} {plugin} {scrollEl} />
  {:else if b.kind === 'shelves'}
    <Shelves block={b} {tab} {plugin} {scrollEl} />
  {:else if b.kind === 'albumSongs'}
    <AlbumSongs block={b} {tab} {plugin} {scrollEl} />
  {:else if b.kind === 'songs'}
    {#if gapBefore(i)}<div class="gap"></div>{/if}
    <Songs block={b} {plugin} {scrollEl} />
  {:else if b.kind === 'rows'}
    <Rows block={b} {tab} {plugin} {scrollEl} />
  {:else if b.kind === 'tree'}
    <Tree block={b} {tab} />
  {:else if b.kind === 'empty'}
    {#if b.title}
      {#if hasButtons(b)}
        <Empty title={b.title} text={b.text}>{@render emptyButtons(b)}</Empty>
      {:else}
        <Empty title={b.title} text={b.text} />
      {/if}
    {:else}
      <p class="note">{b.text}</p>
      {#if hasButtons(b)}<div class="acts note-acts">{@render emptyButtons(b)}</div>{/if}
    {/if}
  {:else if b.kind === 'changes'}
    <Changes block={b} {tab} {plugin} />
  {:else if b.kind === 'text'}
    <h3
      class="part section-label"
      class:over-rows={overRows(i)}
      class:top={underHead(i)}
      class:gap-above={b.part && !underHead(i)}
      class:after-tiles={blocks[i - 1]?.kind === 'tiles'}
    >
      {b.text}
    </h3>
  {:else if b.kind === 'chips'}
    <Chips block={b} {tab} {plugin} />
  {:else}
    <Results block={b} {scrollEl} {wider} />
  {/if}
{/each}

<style>
  .gap {
    height: 22px;
  }
  .part {
    margin: 0 0 14px;
  }
  /* a part of an artist's page (ticket 099) */
  .gap-above {
    margin-top: 30px;
  }
  /* the grid's last row ends in its 20px row gap */
  .gap-above.after-tiles {
    margin-top: 10px;
  }
  .over-rows {
    margin: 14px 12px 6px;
  }
  .over-rows.top {
    margin-top: 4px;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .note-acts {
    padding: 6px 12px;
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
