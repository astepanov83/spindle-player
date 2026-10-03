// The Radio tab as blocks (tickets 029, 062): My stations, filtered at once
// by the search box, then Radio Browser's stations for it. A row plays its
// station; its star saves or removes it; My stations' menu moves and removes.
import { itemKey } from '../../../../shared/plugins/items'
import { stationArt, type Station } from '../../../../shared/stations'
import { fmtCount } from '../../format'
import { rowsBlock, type Block, type ItemRow } from '../types'
import { bitrateLine, searchRows, stationLine, stationMatches } from './logic'
import { radioSearch } from './search.svelte'
import { radio } from './store.svelte'

const note = (text: string): Block => ({ kind: 'empty', id: '', text })

export function radioBlocks(query: string): Block[] {
  const q = query.trim()
  const mine = radio.stations.filter((s) => stationMatches(s, q))
  const blocks: Block[] = [
    {
      kind: 'head',
      look: 'list',
      id: '',
      title: 'Radio',
      meta: 'Internet radio',
      count: fmtCount(radio.stations.length, 'station', 'stations'),
      searchHint: 'Find stations with the search box'
    },
    { kind: 'text', text: 'My stations' },
    stationRows(mine, true)
  ]
  if (!radio.stations.length)
    blocks.push(note('No stations yet. Search for one, then press its star to keep it here.'))
  else if (!mine.length) blocks.push(note('None of My stations match.'))

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

function stationRows(list: Station[], saved: boolean, stale = false): Block {
  return rowsBlock<Station>({
    items: list,
    key: (s) => s.id,
    row: (s) => stationRow(s, saved),
    stale
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

// A row's star or menu. Star on a result saves it (the playing copy if it
// plays, with the streams main found and the stream picked); on a saved
// station it removes it, as Remove does.
export function actOnStation(id: string, actionId: string): void {
  const s = radio.stations.find((x) => x.id === id)
  if (actionId === 'star') {
    if (s) void radio.remove(id)
    else {
      const found = radio.station?.id === id ? radio.station : radioSearch.find(id)
      if (found) void radio.save(found)
    }
  } else if (!s) return
  else if (actionId === 'remove') void radio.remove(id)
  else if (actionId === 'up' || actionId === 'down') void radio.move(id, actionId === 'up' ? -1 : 1)
}
