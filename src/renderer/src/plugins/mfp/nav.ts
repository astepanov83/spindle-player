// The MFP tab and its open episode. MfpView reads and changes it here until
// a block draws it (ticket 061). Pages: "episode/<album id>" (ruling R1).
import { library } from '../../stores/library.svelte'
import type { PageAddress, Tab } from '../types'

export const episodePage = (id: string): string => `episode/${id}`

function episodeOf(page: string): string | null {
  return page.startsWith('episode/') && page.length > 'episode/'.length
    ? page.slice('episode/'.length)
    : null
}

const isEpisode = (id: string): boolean => library.findAlbum(id)?.online === 'mfp'

export const mfpTabs = (): Tab[] => [
  { id: 'mfp', label: 'MFP', icon: 'viz', search: 'Search mixes' }
]

export const mfpTabOf = (page: string): string | undefined => (episodeOf(page) ? 'mfp' : undefined)

export function canOpenMfp(to: PageAddress): boolean {
  const id = episodeOf(to.page)
  return !!id && isEpisode(id)
}

// an episode that is gone (MFP turned off, a feed that dropped it) closes
export function keepMfp(_tab: string, page: string): string {
  const id = episodeOf(page)
  return id && isEpisode(id) ? page : ''
}

export function mfpPath(_tab: string, page: string): string[] {
  const id = episodeOf(page)
  return id ? [`episode:${id}`] : []
}

// the open episode, null for the list
export const shownEpisode = (): string | null => episodeOf(library.page('mfp'))

// null is the back link
export function openEpisode(id: string | null): void {
  library.openPage('mfp', id ? episodePage(id) : '')
}
