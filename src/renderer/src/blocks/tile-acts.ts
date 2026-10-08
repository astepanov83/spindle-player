// What a tile does, in every look that draws one (the grid, the list, the
// shelves): its playing mark, its drag, its menu, and the runs of a grouped
// list worked out once per list. A list row is a tile with columns.
import type { PluginId } from '../../../shared/plugins'
import { groupRuns, type Run } from '../library/groups'
import { sections, songMenu } from '../library/song-menu'
import { actOnPage } from '../plugins'
import type { Tile, TileGroups } from '../plugins/types'
import { menu } from '../stores/menu.svelte'
import { queues } from '../stores/queues.svelte'
import { songDrag } from '../stores/song-drag.svelte'

// one of its songs is the one playing (not while radio plays)
export const tilePlaying = (t: Tile): boolean => !!queues.item && !!t.playing?.(queues.item)

// A tile dragged takes all its songs to a playlist or the queue (ticket 089).
// `sub`: the line under the title on the copy that follows the pointer.
export function tilePress(e: PointerEvent, t: Tile, sub = t.subtitle): void {
  songDrag.press(e, () => ({
    keys: t.songs(),
    from: t.from,
    link: t.link,
    title: t.title,
    sub,
    cover: t.art?.cover ?? t.photo
  }))
}

// the click that ends a drag opens and plays nothing
export const unlessDragged = (run: () => void) => (): void => {
  if (!songDrag.tookClick()) run()
}

// The song menu for its songs, then its own entries ("Edit artist"), which
// the plugin acts on with the tile's key.
export function tileMenu(e: MouseEvent, plugin: PluginId, key: string, t: Tile): void {
  menu.showFor(
    e,
    sections(
      songMenu(t.songs(), { from: t.from, link: t.link }),
      (t.actions ?? []).map((a) => ({ label: a.label, run: () => actOnPage(plugin, key, a.id) }))
    )
  )
}

// The runs of another list than the one shown: keepPlace works out the
// place on the list before a scan's change and the one after, so the last
// one is kept. Call once per component.
export function runsCache<T = unknown>(): (
  list: readonly T[],
  groups: TileGroups<T> | undefined
) => Run[] | undefined {
  let last: { items: readonly T[]; runs: Run[] | undefined } | undefined
  return (list, groups) => {
    if (last?.items !== list)
      last = { items: list, runs: groups && groupRuns(list, groups.grouping) }
    return last.runs
  }
}
