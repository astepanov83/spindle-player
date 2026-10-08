// The Radio tab as blocks (tickets 029, 062, 082): My stations, filtered at
// once by the search box, then Radio Browser's stations for it; before a
// search, tags to search and Radio Browser's popular stations. A row plays
// its station; its star saves or removes it; My stations' menu moves and
// removes, and a drag moves.
import { itemKey } from '../../../../shared/plugins/items'
import { stationArt, type Station } from '../../../../shared/plugins/radio/stations'
import { pictureOf } from '../../../../shared/library'
import { fmtCount } from '../../format'
import { rowsBlock, type Block, type ItemRow } from '../types'
import { bitrateLine, searchRows, stationLine, stationMatches, stationTags } from './logic'
import { radioPopular } from './popular.svelte'
import { radioSearch } from './search.svelte'
import { radio } from './store.svelte'

const note = (text: string): Block => ({ kind: 'empty', id: '', text })

// popular stations shown, not counting those in My stations
const popularShown = 20

export function radioBlocks(query: string): Block[] {
  const q = query.trim()
  const mine = radio.stations.filter((s) => stationMatches(s, q))
  const blocks: Block[] = [
    {
      kind: 'head',
      look: 'list',
      id: '',
      title: 'Radio',
      count: fmtCount(radio.stations.length, 'station', 'stations'),
      searchHint: 'Find stations with the search box'
    },
    { kind: 'text', text: 'My stations' },
    stationRows(mine, true, false, true)
  ]
  if (!radio.stations.length)
    blocks.push(note('No stations yet. Search for one, then press its star to keep it here.'))
  else if (!mine.length) blocks.push(note('None of My stations match.'))

  if (!q) return [...blocks, ...browseBlocks()]
  const status = radioSearch.status
  if (status === 'idle') return blocks
  blocks.push({ kind: 'text', text: 'From Radio Browser' })
  // a saved station shows only under My stations
  const found = searchRows(radioSearch.results, radio.stations)
  if (status === 'unreachable')
    blocks.push(note("Radio Browser can't be reached. My stations still play."))
  else if (status === 'searching' && !found.length) blocks.push(note('Searching…'))
  else if (status === 'done' && !found.length)
    blocks.push(
      note(
        radioSearch.results.length ? 'Every station found is in My stations.' : 'No stations found.'
      )
    )
  else blocks.push(stationRows(found, false, status === 'searching'))
  return blocks
}

// Before a search: tags to search, then the popular stations not in My
// stations. Offline, one quiet line says so: a notice would be too loud for
// something the user did not ask for.
function browseBlocks(): Block[] {
  const popular = searchRows(radioPopular.stations, radio.stations).slice(0, popularShown)
  const tags = stationTags(radio.stations, radioPopular.stations)
  const out: Block[] = []
  if (tags.length) out.push({ kind: 'chips', label: 'Search a tag', words: tags })
  const status = radioPopular.status
  if (status === 'done' && !popular.length) return out
  out.push({ kind: 'text', text: 'Popular stations' })
  if (status === 'unreachable') out.push(note("Radio Browser can't be reached."))
  else if (status !== 'done') out.push(note('Loading…'))
  else out.push(stationRows(popular, false))
  return out
}

function stationRows(list: Station[], saved: boolean, stale = false, reorder = false): Block {
  return rowsBlock<Station>({
    rows: 'item',
    items: list,
    key: (s) => s.id,
    row: (s) => stationRow(s, saved),
    stale,
    ...(reorder ? { reorder } : {})
  })
}

function stationRow(s: Station, saved: boolean): ItemRow {
  const line = stationLine(s)
  const at = saved ? radio.stations.indexOf(s) : -1
  const menu: ItemRow['menu'] = []
  if (at > 0) menu.push({ id: 'up', label: 'Move up' })
  if (at >= 0 && at < radio.stations.length - 1) menu.push({ id: 'down', label: 'Move down' })
  if (saved) menu.push({ id: 'remove', label: 'Remove' })
  return {
    title: s.name,
    ...(line ? { subtitle: line } : {}),
    art: logo(s, saved),
    made: pictureOf(stationArt(s)),
    meta: bitrateLine(s),
    play: itemKey('radio', s.id),
    star: saved
      ? { on: true, label: 'Remove from My stations' }
      : { on: false, label: 'Add to My stations' },
    ...(menu.length ? { menu } : {})
  }
}

// A saved station's logo is a cover (030). A result's comes through main,
// which fetches it when the row shows: the page can't load from the web.
function logo(s: Station, saved: boolean): string | undefined {
  if (s.logo) return stationArt(s).cover
  return !saved && s.logoUrl ? `spindle://radio-logo/${s.id}` : undefined
}

// A result or popular station, which the tab shows and plays.
export const shownStation = (id: string): Station | undefined =>
  radioSearch.find(id) ?? radioPopular.find(id)

// A row's star, menu or drag. Star on a result saves it (the playing copy if
// it plays, with the streams main found and the stream picked); on a saved
// station it removes it, as Remove does. A drag moves a station to the place
// of the one it was dropped on (`value`, its id).
export function actOnStation(id: string, actionId: string, value?: string): void {
  const s = radio.stations.find((x) => x.id === id)
  if (actionId === 'star') {
    if (s) void radio.remove(id)
    else {
      const found = radio.station?.id === id ? radio.station : shownStation(id)
      if (found) void radio.save(found)
    }
    return
  }
  if (!s) return
  const at = radio.stations.indexOf(s)
  if (actionId === 'remove') void radio.remove(id)
  else if (actionId === 'up') void radio.move(id, at - 1)
  else if (actionId === 'down') void radio.move(id, at + 1)
  else if (actionId === 'move') {
    const to = radio.stations.findIndex((x) => x.id === value)
    if (to >= 0) void radio.move(id, to)
  }
}
