// Radio's messages between main, the preload and its page half.
import type { HistoryEntry, SongCover, Station, StationLogo } from './stations'

export const RadioChannel = {
  stations: 'radio:stations',
  save: 'radio:save',
  remove: 'radio:remove',
  restore: 'radio:restore',
  move: 'radio:move',
  choose: 'radio:choose',
  history: 'radio:history',
  play: 'radio:play',
  lastAnswer: 'radio:last-answer',
  stop: 'radio:stop',
  search: 'radio:search',
  // main to page: a new song title in the stream playing
  title: 'radio:title',
  // main to page: main made or dropped a station's logo (ticket 030)
  logo: 'radio:logo',
  // main to page: the cover of the song playing, found online (ticket 032)
  cover: 'radio:cover'
} as const

// A title read from the stream's ICY metadata, as main heard it.
export interface RadioTitle {
  stationId: string
  title: string
  at: number
}

// A station's logo as main has it now; none when it was dropped. Sent for a
// saved station and one played from search alike.
export interface RadioLogo {
  id: string
  logo?: StationLogo
}

// The cover main found for a title of the stream playing. Sent only while
// that title is the station's newest; a title with none found gets nothing.
export interface RadioCover {
  stationId: string
  // as sent with radio:title
  title: string
  cover: SongCover
}

// Radio Browser's stations for a search, grouped, best voted first (ticket
// 029). ok false: no Radio Browser server could be reached.
// `saved`: My stations, when the search added streams to one of them
export type RadioSearch = { ok: true; stations: Station[]; saved?: Station[] } | { ok: false }

// What main last answered to spindle://radio/<id>: audio (ok) or 502/404, and
// how many bytes of audio it passed on. Lets the page tell a format it can't
// play (audio came, no sound) from a server that can't be reached.
export interface LastAnswer {
  ok: boolean
  bytes: number
}

// What the preload exposes to the page as `window.radioApi`.
// Main owns My stations and checks every change; each one answers with the list as it is now.
export interface RadioApi {
  stations(): Promise<Station[]>
  // a new station goes to the end; a known one is replaced where it is
  save(station: Station): Promise<Station[]>
  remove(id: string): Promise<Station[]>
  // Undo of remove: back where it was, as it was
  restore(id: string): Promise<Station[]>
  // one place up (-1) or down (1)
  move(id: string, by: -1 | 1): Promise<Station[]>
  // the stream url the user picked for the station
  choose(id: string, url: string): Promise<Station[]>
  // the last 50 titles, oldest first
  history(id: string): Promise<HistoryEntry[]>
  // Before the page loads a station's stream: main keeps the station (one from
  // search too) and asks its server for streams. Answers with the station as
  // main knows it now, whose streams spindle://radio/<id>?stream=<n> counts in;
  // undefined for a station it refused.
  play(station: Station): Promise<Station | undefined>
  // what main last answered for the station's stream, if it was asked
  lastAnswer(id: string): Promise<LastAnswer | undefined>
  // Pause: main ends the stream. The page's element keeps it, paused, so the
  // system's media controls stay; play opens a new connection.
  stop(): void
  // Radio Browser's stations by name and by tag. Their logos load from
  // spindle://radio-logo/<station id> while main remembers the search.
  search(q: string): Promise<RadioSearch>
  // Returns a function that stops listening.
  onTitle(listener: (title: RadioTitle) => void): () => void
  // Main fetches a logo when a station is saved or played, after it answered.
  onLogo(listener: (logo: RadioLogo) => void): () => void
  // A song's cover, when "Find missing covers online" found one.
  onCover(listener: (cover: RadioCover) => void): () => void
}

// Which API method each of its page-to-main channels carries (see PageChannels).
export interface RadioChannels {
  [RadioChannel.stations]: RadioApi['stations']
  [RadioChannel.save]: RadioApi['save']
  [RadioChannel.remove]: RadioApi['remove']
  [RadioChannel.restore]: RadioApi['restore']
  [RadioChannel.move]: RadioApi['move']
  [RadioChannel.choose]: RadioApi['choose']
  [RadioChannel.history]: RadioApi['history']
  [RadioChannel.play]: RadioApi['play']
  [RadioChannel.lastAnswer]: RadioApi['lastAnswer']
  [RadioChannel.stop]: RadioApi['stop']
  [RadioChannel.search]: RadioApi['search']
}
