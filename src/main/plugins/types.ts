import type { IdMoves } from '../../shared/id-moves'
import type { PluginId } from '../../shared/plugins'
import type { PageIpc } from '../page-ipc'
import type { CoverCache } from '../covers/cover-cache'
import type { MirrorDns } from './radio/radio-browser'
import type { SettingsStore } from '../settings-store'

// A request to spindle://<host>/...; `parts` are the path pieces.
export type Route = (req: Request, url: URL, parts: string[]) => Response | Promise<Response>

// Pictures every plugin may use. The files plugin provides them when it starts,
// so a plugin that needs the cache starts after it.
export interface CoverService {
  cache: CoverCache
  // an online lookup for a song's cover
  song(
    q: { artist: string; song: string },
    signal: AbortSignal
  ): Promise<Uint8Array | 'none' | 'later'>
  // the list of covers to keep changed
  kept(): void
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
  dns: MirrorDns
  covers: CoverProvider
  // ids a rescan moved: renamed in the playlists and the queue; false when a write failed
  idsMoved(moves: IdMoves): boolean
}

export interface CoverProvider {
  provide(service: CoverService): void
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
  // the "Find missing covers online" setting changed (after the files plugin has it)
  coverSettingChanged?(): void
  windowOpened?(): void
  windowClosed?(): void
  // the player started or stopped playing
  playing?(on: boolean): void
}
