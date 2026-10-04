// MFP at start: what main has, and its news, also while the page waits for
// its first answer.
import { orFallback } from '../../start'
import type { PluginStart } from '../types'
import { mfp } from './store.svelte'

export async function startMfp(): Promise<PluginStart> {
  const heard = { episodes: false, status: false }
  window.mfpApi.onEpisodes((d) => {
    heard.episodes = true
    mfp.load(d)
  })
  window.mfpApi.onStatus((s) => {
    heard.status = true
    mfp.status = s
  })
  const mixes = await orFallback(
    () =>
      window.mfpApi.get().then((d) => {
        // news from before the answer is in it
        heard.episodes = heard.status = false
        return d
      }),
    { episodes: [] },
    'the MFP episodes'
  )
  return {
    load: () => {
      // news that came after main's answer is newer than it
      if (!heard.episodes) mfp.load(mixes.value)
      if (!heard.status) mfp.status = mixes.value.status
      return undefined
    }
  }
}
