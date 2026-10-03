<!-- A page of a plugin's tab: its blocks, each drawn by the core's view for
     its kind. Only the plugin's data differs from page to page. -->
<script lang="ts">
  import type { PluginId } from '../../../shared/plugins'
  import Empty from '../library/Empty.svelte'
  import MfpView from '../library/MfpView.svelte'
  import RadioView from '../library/RadioView.svelte'
  import SearchResults from '../library/SearchResults.svelte'
  import type { Block, NavKind } from '../plugins/types'
  import Head from './Head.svelte'
  import Nothing from './Nothing.svelte'
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
</script>

{#if lone?.kind === 'empty'}
  <div class="fill"><Nothing block={lone} {plugin} /></div>
{:else}
  {#each blocks as b, i (keys[i])}
    {#if b.kind === 'head'}
      <Head block={b} {tab} {plugin} />
    {:else if b.kind === 'tiles'}
      <Tiles block={b} {tab} {plugin} {scrollEl} />
    {:else if b.kind === 'songs'}
      {#if gapBefore(i)}<div class="gap"></div>{/if}
      <Songs block={b} {plugin} {scrollEl} />
    {:else if b.kind === 'rows'}
      <Rows block={b} {tab} {scrollEl} />
    {:else if b.kind === 'tree'}
      <Tree block={b} {tab} />
    {:else if b.kind === 'empty'}
      <Empty title={b.title} text={b.text} />
    {:else if b.kind === 'text'}
      <h3 class="part section-label">{b.text}</h3>
    {:else if b.view === 'radio'}
      <!-- the old views, until blocks draw them (tickets 061, 062, 059 part C) -->
      <RadioView {nav} />
    {:else if b.view === 'mfp'}
      <MfpView />
    {:else}
      <SearchResults {scrollEl} />
    {/if}
  {/each}
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
  .part {
    margin: 0 0 14px;
  }
</style>
