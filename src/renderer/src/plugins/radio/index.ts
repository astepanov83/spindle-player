// Radio's page half: stations are live items. The store does the playing
// (reconnects, streams, titles); this answers the core's questions from it.
import { stationArt, type Station } from '../../../../shared/stations'
import type { ItemState, LivePlugin, PageHalf } from '../types'
import { stationLine, stepStation } from './logic'
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

const live: LivePlugin = {
  show: (id, h) => {
    const s = radio.find(id)
    if (s) radio.select(s, h)
  },
  play: async (id, h) => {
    const s = radio.take(id)
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
    const s = radio.find(id)
    return s ? stationState(s) : radio.loaded ? missing : loading
  },
  // stations play through `live`, never from the track queue
  play: () => undefined,
  tabs: () => [{ id: 'radio', label: 'Radio', icon: 'radio', search: 'Search stations' }],
  tabOf: (page) => (page === '' ? 'radio' : undefined),
  canOpen: (to) => to.page === '',
  version: () => (radio.loaded ? 1 : 0),
  live,
  // the bar's actions are the playing station's (store.svelte.ts, #actions)
  act: (id, actionId, value) => {
    if (id !== radio.station?.id) return
    if (actionId === 'save') void radio.save()
    else if (actionId === 'stream' && value !== undefined) radio.choose(Number(value))
  }
}
