// The MFP tab and its pages: "" for the episode list, "episode/<id>" for an
// episode (ruling R1; saved links hold these).
import type { PageAddress, Tab } from '../types'
import { mfp } from './store.svelte'

export const episodePage = (id: string): string => `episode/${id}`

export function episodeOf(page: string): string | null {
  return page.startsWith('episode/') && page.length > 'episode/'.length
    ? page.slice('episode/'.length)
    : null
}

const isEpisode = (id: string): boolean => !!mfp.episode(id)

export const mfpTabs = (): Tab[] => [
  { id: 'mfp', label: 'MFP', icon: 'viz', search: 'Search mixes' }
]

export const mfpTabOf = (page: string): string | undefined => (episodeOf(page) ? 'mfp' : undefined)

export function canOpenMfp(to: PageAddress): boolean {
  const id = episodeOf(to.page)
  return !!id && isEpisode(id)
}

// an episode that is gone (the site dropped it) closes
export function keepMfp(_tab: string, page: string): string {
  const id = episodeOf(page)
  return id && isEpisode(id) ? page : ''
}

export function mfpPath(_tab: string, page: string): string[] {
  const id = episodeOf(page)
  return id ? [`episode:${id}`] : []
}
