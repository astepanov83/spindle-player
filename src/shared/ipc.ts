import type { ArtistChanges } from './plugins/files/artist-overrides'
import type { IdMoves } from './id-moves'
import type { ScanStatus } from './library'
import type { MfpEpisodes, MfpStatus } from './plugins/mfp/mfp'
import type { Playlist } from './playlists'
import type { QueuePlace, SavedPlaying, SavedQueue, SavedQueues } from './saved-queue'
import type { Settings } from './settings'
import type { HistoryEntry, SongCover, Station, StationLogo } from './plugins/radio/stations'

// Channel names used by both main and preload, so a typo is a type error.
export const WinChannel = {
  minimize: 'win:minimize',
  toggleMaximize: 'win:toggle-maximize',
  close: 'win:close',
  isMaximized: 'win:is-maximized',
  maximized: 'win:maximized',
  askClose: 'win:ask-close',
  closeShown: 'win:close-shown',
  closeAnswer: 'win:close-answer'
} as const

export const SettingsChannel = {
  load: 'settings:load',
  save: 'settings:save'
} as const

// What the preload exposes to the page as `window.win`.
export interface WinApi {
  minimize(): void
  toggleMaximize(): void
  close(): void
  isMaximized(): Promise<boolean>
  // Returns a function that stops listening.
  onMaximized(listener: (maximized: boolean) => void): () => void
  // Before the window closes, while the setting is 'ask' (ticket 049). The
  // page says at once that it shows the question, or main closes the window
  // anyway; then it answers, or says nothing on Cancel.
  onAskClose(listener: () => void): () => void
  closeShown(): void
  closeAnswer(action: 'minimize' | 'quit'): void
}

// What the preload exposes to the page as `window.settingsApi`.
// Main applies what changed: the window size for a new template, the theme.
export interface SettingsApi {
  // the settings as they were when the page loaded
  load(): Promise<Settings>
  // toFile false: the page could not load them, so main applies them to the
  // window but doesn't save them over the user's file
  save(settings: Settings, toFile: boolean): void
}

export const LibraryChannel = {
  load: 'library:load',
  // the whole library now, for a page that missed a patch
  get: 'library:get',
  addFolder: 'library:add-folder',
  // folders dropped on the window, as paths the preload got from the files
  addDropped: 'library:add-dropped',
  removeFolder: 'library:remove-folder',
  rescan: 'library:rescan',
  setArtists: 'library:set-artists',
  showFolder: 'library:show-folder',
  // main to page: what changed in the library (a patch, see library-patch.ts)
  changed: 'library:changed',
  // main to page: scan progress and the folder list
  status: 'library:status',
  // main to page: track ids that changed, sent before the library that has them
  idsMoved: 'library:ids-moved'
} as const

// What came of a drop: the folders added, and how many were music folders
// already or were not folders at all (files, or paths that are gone).
export interface DropResult {
  added: string[]
  known: number
  other: number
  // settings.json could not be read, so nothing was added
  unreadable?: true
}

// More paths than a person drags at once; such a list is not taken at all.
// The preload sends at most one more, so main still sees it is too many.
export const maxDropped = 50

// What the preload exposes to the page as `window.libraryApi`.
// Main owns the folder list and the index; the page only asks.
export interface LibraryApi {
  // The library as it was when the page loaded (from the index on disk).
  // Libraries come as UTF-8 JSON of a LibraryMessage (library-patch.ts): main
  // passes the bytes on without reading them, and copying bytes is much
  // cheaper than copying 50k objects.
  // `moves`: track ids that changed this run (see id-moves.ts)
  load(): Promise<{ library: Uint8Array; status: ScanStatus; moves: IdMoves }>
  // the whole library now, when a patch doesn't fit the one the page has;
  // rejects when main has none, so the page keeps what it shows
  get(): Promise<Uint8Array>
  // opens the folder picker; resolves once the choice is saved
  addFolder(): Promise<void>
  // files dropped on the window: the folders among them become music folders
  addDropped(files: File[]): Promise<DropResult>
  removeFolder(path: string): void
  rescan(): void
  // rename or split artists (ticket 024); the library comes back with them
  setArtists(changes: ArtistChanges): void
  // opens a folder in the system's file manager: a music folder's path, then
  // the names below it; false when it is gone or could not be opened
  showFolder(parts: string[]): Promise<boolean>
  onChanged(listener: (library: Uint8Array) => void): () => void
  onStatus(listener: (status: ScanStatus) => void): () => void
  onIdsMoved(listener: (moves: IdMoves) => void): () => void
}

export const PlaylistChannel = {
  load: 'playlists:load',
  save: 'playlists:save'
} as const

// What the preload exposes to the page as `window.playlistsApi`.
// The page edits the list and sends all of it; main checks it and saves it.
export interface PlaylistsApi {
  load(): Promise<Playlist[]>
  save(playlists: Playlist[]): void
}

export const PlaybackChannel = {
  loadQueue: 'queue:load',
  saveQueue: 'queue:save',
  savePlace: 'queue:save-place',
  savePlaying: 'queue:save-playing',
  playing: 'playback:playing',
  log: 'playback:log'
} as const

// What the preload exposes to the page as `window.playbackApi`.
export interface PlaybackApi {
  // the queues, their places and what played, from the last run
  loadQueue(): Promise<SavedQueues>
  // the track queue's whole list; sent only when the list changes
  saveQueue(queue: SavedQueue): void
  // the current song and seconds into it; sent on every song change and while playing
  savePlace(place: QueuePlace): void
  // radio or the queue, and the station; kept in queue.json too (ticket 027)
  savePlaying(playing: SavedPlaying): void
  // play or pause; while a song plays, the library scan slows down
  playing(playing: boolean): void
  // a song that would not play, written to main's log
  log(text: string): void
}

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

// Which API method each page-to-main channel carries. The preload's calls and
// main's handlers are both typed from this, so a change on one side and not
// the other is a type error.
export interface PageChannels {
  [WinChannel.minimize]: WinApi['minimize']
  [WinChannel.toggleMaximize]: WinApi['toggleMaximize']
  [WinChannel.close]: WinApi['close']
  [WinChannel.isMaximized]: WinApi['isMaximized']
  [WinChannel.closeShown]: WinApi['closeShown']
  [WinChannel.closeAnswer]: WinApi['closeAnswer']
  [SettingsChannel.load]: SettingsApi['load']
  [SettingsChannel.save]: SettingsApi['save']
  [LibraryChannel.load]: LibraryApi['load']
  [LibraryChannel.get]: LibraryApi['get']
  [LibraryChannel.addFolder]: LibraryApi['addFolder']
  [LibraryChannel.removeFolder]: LibraryApi['removeFolder']
  // the preload turns the page's files into paths (webUtils.getPathForFile)
  [LibraryChannel.addDropped]: (paths: string[]) => Promise<DropResult>
  [LibraryChannel.rescan]: LibraryApi['rescan']
  [LibraryChannel.setArtists]: LibraryApi['setArtists']
  [LibraryChannel.showFolder]: LibraryApi['showFolder']
  [PlaylistChannel.load]: PlaylistsApi['load']
  [PlaylistChannel.save]: PlaylistsApi['save']
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
  [MfpChannel.get]: MfpApi['get']
  [MfpChannel.refresh]: MfpApi['refresh']
  [PlaybackChannel.loadQueue]: PlaybackApi['loadQueue']
  [PlaybackChannel.saveQueue]: PlaybackApi['saveQueue']
  [PlaybackChannel.savePlace]: PlaybackApi['savePlace']
  [PlaybackChannel.savePlaying]: PlaybackApi['savePlaying']
  [PlaybackChannel.playing]: PlaybackApi['playing']
  [PlaybackChannel.log]: PlaybackApi['log']
}

// Channels that answer (ipcRenderer.invoke) and channels that only send.
export type InvokeChannel = {
  [K in keyof PageChannels]: ReturnType<PageChannels[K]> extends Promise<unknown> ? K : never
}[keyof PageChannels]
export type SendChannel = Exclude<keyof PageChannels, InvokeChannel>
