import type { IdMoves } from '../../shared/id-moves'
import type { PluginId } from '../../shared/plugins'
import type { PageIpc } from '../page-ipc'
import type { CoverCache } from '../covers/cover-cache'
import type { SettingsStore } from '../settings-store'

// A request to spindle://<host>/...; `parts` are the path pieces.
export type Route = (req: Request, url: URL, parts: string[]) => Response | Promise<Response>

// Name lookups, handed in so a test can fake them.
export interface Dns {
  lookup(host: string, o: { all: true }): Promise<{ address: string; family: number }[]>
  reverse(ip: string): Promise<string[]>
}

// A song to find a cover for.
export interface SongQuery {
  artist: string
  song: string
}

// Pictures every plugin may use: the core makes the cache at start, on or
// off; the online song lookup comes from a plugin's helper (CoverHelper).
export interface CoverService {
  cache: CoverCache
  // an online lookup for a song's cover
  song(q: SongQuery, signal: AbortSignal): Promise<Uint8Array | 'none' | 'later'>
  // the list of covers to keep changed
  kept(): void
}

// What a plugin adds to the core's covers, whether it is on or off: the online
// song lookup (run next to its album lookup, so both keep to the same limits),
// the prune that keeps the covers others list, and the picture a cover was
// made from.
export interface CoverHelper {
  song(q: SongQuery, signal: AbortSignal): Promise<Uint8Array | 'none' | 'later'>
  // the covers other plugins keep changed
  kept(): void
  source(hash: string): Promise<Uint8Array | undefined>
}

export interface PluginContext {
  settings: SettingsStore
  userData: string
  userAgent: string
  log(text: string): void
  toPage(channel: string, data: unknown): void
  // only the app window's page may use these
  page: PageIpc
  // add the handler for a spindle:// host
  route(host: string, handler: Route): void
  // Electron's network, handed in so a test can fake it
  fetch: typeof fetch
  request(options: Electron.ClientRequestConstructorOptions): Electron.ClientRequest
  dns: Dns
  covers: CoverProvider
  // ids a rescan moved: renamed in the playlists and the queue; false when a write failed
  idsMoved(moves: IdMoves): boolean
}

export interface CoverProvider {
  provide(helper: CoverHelper): void
  get(): CoverService
  // no-op until provided
  kept(): void
}

export interface MainPlugin {
  id: PluginId
  // made once, on or off; the settings save calls setOn after it
  start(ctx: PluginContext): void
  setOn(on: boolean): void
  // covers it made and keeps, on or off, so the prune doesn't drop them.
  // Asked before start too.
  keptCovers(): string[]
  flushSync(): void
  // Slower quit work, waited for. Nothing when there is nothing left to wait for.
  flush?(): Promise<void> | undefined
  // the "Find missing covers online" setting changed (in list order)
  coverSettingChanged?(): void
  windowOpened?(): void
  windowClosed?(): void
  // the player started or stopped playing
  playing?(on: boolean): void
}
