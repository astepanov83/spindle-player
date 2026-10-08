<!-- The column look of an artist's page (ticket 101): the back line across
     the page, then the artist in a 220px column that stays in view while
     their songs and releases on the right scroll. Under 640px the column goes
     back on top, as the sections look's head. The page scrolls as one, so
     the right side's lists, kept places and jumps work as on any page. -->
<script lang="ts">
  import type { PluginId } from '../../../shared/plugins'
  import { columnSide, stickTop } from '../library/artist-column'
  import type { ShownTab } from '../plugins/tabs'
  import type { ColumnBlock, NavKind } from '../plugins/types'
  import Blocks from './Blocks.svelte'
  import Head from './Head.svelte'

  let {
    block: b,
    tab,
    plugin,
    scrollEl,
    nav,
    wider
  }: {
    block: ColumnBlock
    tab: string
    plugin: PluginId
    scrollEl: HTMLElement | undefined
    nav: NavKind
    wider: ShownTab[]
  } = $props()

  let width = $state(0)
  const side = $derived(columnSide(width))

  // The view's height inside the scroll box's padding, where a sticky box
  // stays, and the column's, so a tall column sticks by its bottom.
  let view = $state(0)
  let tall = $state(0)
  $effect(() => {
    const box = scrollEl
    if (!box) return
    const read = (): void => {
      const s = getComputedStyle(box)
      view = box.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom)
    }
    read()
    const sizes = new ResizeObserver(read)
    sizes.observe(box)
    return () => sizes.disconnect()
  })
</script>

<Head block={b.head} {tab} {plugin} {nav} part="back" />
<!-- the same elements at every width, so the names editor keeps what was
     typed when the window is resized -->
<div class="column" class:side bind:clientWidth={width}>
  <aside bind:offsetHeight={tall} style:top={side ? `${stickTop(view, tall)}px` : undefined}>
    <Head block={b.head} {tab} {plugin} {nav} part="body" column={side} />
  </aside>
  <div class="right">
    <Blocks blocks={b.blocks} {tab} {plugin} {scrollEl} {nav} {wider} headAbove />
  </div>
</div>

<style>
  .column {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }
  .column.side {
    grid-template-columns: 220px minmax(0, 1fr);
    column-gap: 32px;
    align-items: start;
  }
  .side aside {
    position: sticky;
  }
  .right {
    min-width: 0;
  }
  /* the first heading on a line with the top of the picture */
  .side .right {
    padding-top: 8px;
  }
</style>
