// Radio's page half: stations are live items. The store does the playing
// (reconnects, streams, titles); this answers the core's questions from it.
import { stationArt, type Station } from '../../../../shared/plugins/radio/stations'
import type { ItemState, LivePlugin, PageHalf } from '../types'
import { stationLine, stepStation } from './logic'
import { actOnStation, radioBlocks, shownStation } from './page'
import { radioPopular } from './popular.svelte'
import { radioSearch } from './search.svelte'
import { startRadio } from './start'
import { radio, radioPage } from './store.svelte'

const missing: ItemState = { state: 'missing' }
const loading: ItemState = { state: 'loading' }

// one answer per station object, so asking makes no objects
const answers = new WeakMap<Station, ItemState>()

function stationState(s: Station): ItemState {
  let a = answers.get(s)
  if (!a) {
    const line = stationLine(s)
    a = {
      state: 'ok',
      info: {
        title: s.name,
        ...(line ? { subtitle: line } : {}),
        art: stationArt(s),
        titleTo: radioPage
      }
    }
    answers.set(s, a)
  }
  return a
}

// My stations, the one playing, or a result or popular station the Radio tab shows
const station = (id: string): Station | undefined => radio.find(id) ?? shownStation(id)

const live: LivePlugin = {
  show: (id, h) => {
    const s = station(id)
    if (s) radio.select(s, h)
  },
  play: async (id, h) => {
    const s = station(id)
    return s ? radio.play(s, h) : undefined
  },
  pause: () => radio.pause(),
  resume: () => radio.resume(),
  events: () => radio.events,
  next: (id) => stepStation(radio.stations, id, 1),
  previous: (id) => stepStation(radio.stations, id, -1)
}

export const radioHalf: PageHalf = {
  // before My stations came, a station may still be one of them
  info: (id) => {
    const s = station(id)
    return s ? stationState(s) : radio.loaded ? missing : loading
  },
  // stations play through `live`, never from the track queue
  play: () => undefined,
  tabs: () => [{ id: 'radio', label: 'Radio', icon: 'radio', search: 'Search stations' }],
  tabOf: (page) => (page === '' ? 'radio' : undefined),
  canOpen: (to) => to.page === '',
  page: (_tab, _page, query) => radioBlocks(query),
  // Radio Browser is asked 400ms after typing stops, or at once on Enter.
  // Its popular stations are asked when the tab opens.
  typed: (_tab, query, enter) => {
    radioPopular.want()
    if (enter) radioSearch.now(query)
    else radioSearch.want(query)
  },
  version: () => (radio.loaded ? 1 : 0),
  live,
  start: startRadio,
  // The bar's actions are the playing station's (store.svelte.ts, #actions);
  // the others, a row's star and menu (page.ts).
  act: (id, actionId, value) => {
    if (actionId === 'save') {
      if (id === radio.station?.id) void radio.save()
    } else if (actionId === 'stream') {
      if (id === radio.station?.id && value !== undefined) radio.choose(Number(value))
    } else actOnStation(id, actionId, value)
  }
}
