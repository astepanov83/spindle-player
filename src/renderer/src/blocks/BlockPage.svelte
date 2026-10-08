<!-- A page of a plugin's tab: its blocks, each drawn by the core's view for
     its kind. Only the plugin's data differs from page to page. -->
<script lang="ts">
  import type { PluginId } from '../../../shared/plugins'
  import { typedIn, widerTabs } from '../plugins'
  import type { Block, NavKind } from '../plugins/types'
  import { library } from '../stores/library.svelte'
  import Blocks from './Blocks.svelte'
  import Nothing from './Nothing.svelte'
  import SearchButtons from './SearchButtons.svelte'

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

  // The other tabs that search wider, while there is text (ticket 077): in
  // the block that says nothing was found, else at the end of the page, for
  // a search that found little. A results page shows them itself.
  const wider = $derived(widerTabs(tab, nav))
  const atEnd = $derived(
    !lone &&
      wider.length > 0 &&
      !blocks.some((b) => b.kind === 'results' || (b.kind === 'empty' && b.nothingFound))
  )

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
  <div class="fill">
    <Nothing block={lone} {plugin} wider={lone.nothingFound ? wider : []} />
  </div>
{:else}
  <Blocks {blocks} {tab} {plugin} {scrollEl} {nav} {wider} />
  {#if atEnd}<div class="acts at-end"><SearchButtons tabs={wider} /></div>{/if}
  {#if endRoom}<div class="end"></div>{/if}
{/if}

<style>
  .fill {
    min-height: 100%;
    display: flex;
    flex-direction: column;
  }
  .end {
    height: 12px;
    flex-shrink: 0;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .at-end {
    margin-top: 22px;
  }
</style>
