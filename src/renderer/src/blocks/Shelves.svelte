<!-- A shelves block (ticket 098): a shelf per artist, their heading over
     their albums in a line that scrolls sideways. Only the shelves near the
     view are drawn, each the same height. With letters, the A-Z strip.
     Keys: the shelves are one Tab stop; Up and Down move between shelves,
     Left and Right along one (the heading before the first album), Enter
     opens, Space plays. -->
<script lang="ts">
  import { tick } from 'svelte'
  import type { PluginId } from '../../../shared/plugins'
  import { groupRuns } from '../library/groups'
  import { shelfLeft, shelfMove, type ShelfSpot } from '../library/shelf-rows'
  import { addFinder } from '../ui/item-finder'
  import { keepPlace } from '../ui/keep-place.svelte'
  import { virtualList } from '../ui/virtual-list.svelte'
  import { itemsVersion } from '../plugins'
  import type { ShelvesBlock } from '../plugins/types'
  import LetterStrip from './LetterStrip.svelte'
  import { playPage } from './page-play'
  import Shelf from './Shelf.svelte'

  let {
    block: b,
    tab,
    plugin,
    scrollEl
  }: {
    block: ShelvesBlock
    tab: string
    plugin: PluginId
    scrollEl: HTMLElement | undefined
  } = $props()

  // the heading (76), the shelf (204) and the space under it; every shelf
  // the same, so none is measured
  const ROW = 292

  let list: HTMLDivElement | undefined = $state()

  const items = $derived(b.items as unknown[])
  // a shelf keeps its drawn tiles and sideways place with its artist
  const rowKey = $derived.by(() => {
    const all = items
    return (i: number): string => (all[i] === undefined ? `${i}` : b.key(all[i]))
  })
  const v = virtualList(() => ({ count: items.length, scrollEl, list, size: ROW, key: rowKey }), 3)

  keepPlace(() => ({
    scrollEl,
    list,
    items,
    per: 1,
    rowSize: ROW,
    key: (x: unknown) => b.key(x),
    source: itemsVersion()
  }))

  // so another look of the view can start at a shelf not drawn (ticket 095)
  $effect(() =>
    addFinder((key) => {
      const i = items.findIndex((x) => b.key(x) === key)
      return i < 0 ? undefined : v.startOf(i)
    })
  )

  const runs = $derived(b.letters && groupRuns(items, b.letters))
  function goLetter(l: string): void {
    const run = runs?.find((r) => r.heading.letter === l)
    if (run) v.scrollToIndex(run.start)
  }

  // How far each shelf was scrolled sideways, by its key, so one scrolled
  // off the screen and back comes back where it was.
  const lefts: Record<string, number> = {}

  // The place that holds the Tab stop, by the artist's key so a scan that
  // adds artists above leaves it on the same one. While that shelf is not
  // drawn (scrolled away, or gone), the first shelf on screen holds it, at
  // its heading.
  let active: { key: string; at: number } | null = $state(null)

  let top = $state(0)
  $effect(() => {
    const box = scrollEl
    if (!box) return
    const read = (): void => {
      top = box.scrollTop
    }
    read()
    box.addEventListener('scroll', read, { passive: true })
    return () => box.removeEventListener('scroll', read)
  })
  const firstShown = $derived(v.items.find((x) => x.end > top)?.index)
  const activeDrawn = $derived(
    !!active && v.items.some((x) => x.index < items.length && b.key(items[x.index]) === active?.key)
  )
  const stopOf = (i: number): number | undefined => {
    if (active && activeDrawn) return b.key(items[i]) === active.key ? active.at : undefined
    return i === firstShown ? -1 : undefined
  }

  const shelfEl = (i: number): HTMLElement | null =>
    list?.querySelector<HTMLElement>(`[data-shelf="${i}"]`) ?? null
  // the heading's name, or the album's cover button
  const stopEl = (row: HTMLElement, at: number): HTMLElement | null =>
    at < 0
      ? row.querySelector<HTMLElement>('.headbox button')
      : row.querySelector<HTMLElement>(`[data-at="${at}"] [data-stop]`)

  const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()))

  async function focusSpot(s: ShelfSpot): Promise<void> {
    active = { key: b.key(items[s.shelf]), at: s.at }
    let row = shelfEl(s.shelf)
    if (!row) {
      v.scrollToIndex(s.shelf)
      await tick()
      // the virtual list draws on its next frame
      await nextFrame()
      row = shelfEl(s.shelf)
    }
    if (!row) return
    const line = row.querySelector<HTMLElement>('.shelf')
    if (line && s.at >= 0) {
      const to = shelfLeft(s.at, line.scrollLeft, line.clientWidth)
      if (to !== line.scrollLeft) {
        line.scrollLeft = to
        // the shelf draws its tiles there after its scroll event
        await nextFrame()
        await tick()
      }
    }
    stopEl(row, s.at)?.focus({ preventScroll: true })
    row.scrollIntoView({ block: 'nearest' })
  }

  // The shelf and place a key was pressed in: a tile's buttons are at its
  // place, the heading's at -1.
  function spotOf(t: HTMLElement): ShelfSpot | undefined {
    const row = t.closest<HTMLElement>('[data-shelf]')
    if (!row) return undefined
    const tile = t.closest<HTMLElement>('[data-at]')
    if (!tile && !t.closest('.headbox')) return undefined
    return { shelf: Number(row.dataset.shelf), at: tile ? Number(tile.dataset.at) : -1 }
  }

  function onkeydown(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    const t = e.target as HTMLElement
    const s = spotOf(t)
    if (!s) return
    const x = items[s.shelf]
    // Space on a cover or the artist's name plays it, or pauses and resumes
    // it while it plays, as a page's Play. Enter opens (the button's click).
    if (e.code === 'Space' && t.matches('[data-stop], .headbox button:first-of-type')) {
      e.preventDefault()
      if (e.repeat) return
      const p = s.at < 0 ? b.head(x) : b.shelf(x)[s.at]
      if (p) playPage('all', p.songs, p.from, p.link)
      return
    }
    const to = shelfMove(e.key, s, items.length, (i) => b.shelf(items[i]).length)
    if (!to) return
    e.preventDefault()
    void focusSpot(to)
  }

  // a click or Tab into a shelf moves the Tab stop there
  function onfocusin(e: FocusEvent): void {
    const s = spotOf(e.target as HTMLElement)
    if (s) active = { key: b.key(items[s.shelf]), at: s.at }
  }
</script>

<div class="wrap">
  {#if runs}
    <LetterStrip {runs} {scrollEl} go={goLetter} />
  {/if}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="shelves" bind:this={list} style:height="{v.total}px" {onkeydown} {onfocusin}>
    {#each v.items as item (item.key)}
      {@const x = items[item.index]}
      {#if x !== undefined}
        {@const key = b.key(x)}
        {@const title = b.title(x)}
        <section
          class="shelfrow"
          data-shelf={item.index}
          data-item={key}
          aria-label={title}
          style:height="{ROW}px"
          style:transform="translateY({v.offset(item)}px)"
        >
          <Shelf
            heading={{ key, title }}
            artist={b.head(x)}
            tiles={b.shelf(x)}
            {tab}
            {plugin}
            stop={stopOf(item.index)}
            start={lefts[key] ?? 0}
            keep={(left) => (lefts[key] = left)}
          />
        </section>
      {/if}
    {/each}
  </div>
</div>

<style>
  .wrap {
    display: flex;
    gap: 8px;
  }
  .shelves {
    position: relative;
    flex: 1;
    min-width: 0;
  }
  .shelfrow {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
  }
</style>
