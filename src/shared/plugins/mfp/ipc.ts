// Music For Programming's messages between main, the preload and its page half.
import type { MfpEpisodes, MfpStatus } from './mfp'

export const MfpChannel = {
  get: 'mfp:get',
  refresh: 'mfp:refresh',
  // main to page: new episodes or a new picture
  episodes: 'mfp:episodes',
  // main to page: the status line changed
  status: 'mfp:status'
} as const

// What the preload exposes to the page as `window.mfpApi` (ticket 061).
export interface MfpApi {
  // what main has, on or off (no network for it); status only while on
  get(): Promise<MfpEpisodes & { status?: MfpStatus }>
  // reads the site for new episodes, while MFP is on
  refresh(): void
  // Returns a function that stops listening.
  onEpisodes(listener: (data: MfpEpisodes) => void): () => void
  onStatus(listener: (status: MfpStatus | undefined) => void): () => void
}

// Which API method each of its page-to-main channels carries (see PageChannels).
export interface MfpChannels {
  [MfpChannel.get]: MfpApi['get']
  [MfpChannel.refresh]: MfpApi['refresh']
}
