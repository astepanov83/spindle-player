// Radio at start: My stations, and the songs kept from the radio (119).
import { orFallback } from '../../start'
import type { PluginStart } from '../types'
import { heard } from './heard.svelte'
import { radio } from './store.svelte'

export async function startRadio(): Promise<PluginStart> {
  const [stations, kept] = await Promise.all([
    orFallback(() => window.radioApi.stations(), [], 'the radio stations'),
    orFallback(() => window.radioApi.heard(), [], 'the songs kept from the radio')
  ])
  return {
    load: () => {
      // My stations that could not be read stay not loaded: a saved station is
      // then not taken for gone (queues.restore).
      if (stations.ok) radio.load(stations.value)
      heard.load(kept.value)
      return undefined
    }
  }
}
