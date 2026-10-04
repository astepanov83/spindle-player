// Radio at start: My stations.
import { orFallback } from '../../start'
import type { PluginStart } from '../types'
import { radio } from './store.svelte'

export async function startRadio(): Promise<PluginStart> {
  const stations = await orFallback(() => window.radioApi.stations(), [], 'the radio stations')
  return {
    load: () => {
      // My stations that could not be read stay not loaded: a saved station is
      // then not taken for gone (queues.restore).
      if (stations.ok) radio.load(stations.value)
      return undefined
    }
  }
}
