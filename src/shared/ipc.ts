import type { PluginChannels } from './plugins'
import type { Playlist } from './playlists'
import type { QueuePlace, SavedPlaying, SavedQueue, SavedQueues } from './saved-queue'
import type { Settings } from './settings'

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

// Which API method each page-to-main channel of the core carries. The
// preload's calls and main's handlers are both typed from this and the
// plugins' own (PluginChannels), so a change on one side and not the other is
// a type error.
export interface CoreChannels {
  [WinChannel.minimize]: WinApi['minimize']
  [WinChannel.toggleMaximize]: WinApi['toggleMaximize']
  [WinChannel.close]: WinApi['close']
  [WinChannel.isMaximized]: WinApi['isMaximized']
  [WinChannel.closeShown]: WinApi['closeShown']
  [WinChannel.closeAnswer]: WinApi['closeAnswer']
  [SettingsChannel.load]: SettingsApi['load']
  [SettingsChannel.save]: SettingsApi['save']
  [PlaylistChannel.load]: PlaylistsApi['load']
  [PlaylistChannel.save]: PlaylistsApi['save']
  [PlaybackChannel.loadQueue]: PlaybackApi['loadQueue']
  [PlaybackChannel.saveQueue]: PlaybackApi['saveQueue']
  [PlaybackChannel.savePlace]: PlaybackApi['savePlace']
  [PlaybackChannel.savePlaying]: PlaybackApi['savePlaying']
  [PlaybackChannel.playing]: PlaybackApi['playing']
  [PlaybackChannel.log]: PlaybackApi['log']
}

export type PageChannels = CoreChannels & PluginChannels

// Channels that answer (ipcRenderer.invoke) and channels that only send.
export type InvokeChannel = {
  [K in keyof PageChannels]: ReturnType<PageChannels[K]> extends Promise<unknown> ? K : never
}[keyof PageChannels]
export type SendChannel = Exclude<keyof PageChannels, InvokeChannel>
