// Music files: the library process and its service, with the page's library
// requests.
import { BrowserWindow } from 'electron'
import { LibraryChannel } from '../../../shared/plugins/files/ipc'
import type { PluginId } from '../../../shared/plugins'
import { stopAllDecoders } from './decode'
import { libraryRoutes } from './protocol'
import { LibraryService } from './service'
import { showFolder } from '../../show-folder'
import type { MainPlugin, PluginContext } from '../types'

export class FilesPlugin implements MainPlugin {
  readonly id: PluginId = 'files'
  #library: LibraryService | undefined
  #flushed = false
  // set from the saved setting at start; see LibraryService for what off stops
  #on = false

  constructor(
    private readonly o: {
      // the other plugins' covers to keep; the library asks at once for its start data
      keptByOthers: () => string[]
    }
  ) {}

  get library(): LibraryService {
    if (!this.#library) throw new Error('The files plugin has not started')
    return this.#library
  }

  start(ctx: PluginContext): void {
    this.#on = ctx.settings.get().plugins[this.id]
    // Starts reading the index now, while the window loads, on or off: the
    // page gets the library either way, and the radio's song lookup runs in it.
    const library = new LibraryService(
      ctx.settings,
      ctx.toPage,
      ctx.idsMoved,
      ctx.covers.get().cache,
      this.o.keptByOthers,
      ctx.userData,
      this.#on,
      ctx.ai
    )
    this.#library = library
    ctx.covers.provide({
      song: (q, signal) => library.songCover(q, signal),
      kept: () => library.coversKept(),
      source: (hash) => library.coverSource(hash)
    })
    for (const [host, route] of Object.entries(libraryRoutes(library))) ctx.route(host, route)

    const { page, settings } = ctx
    const window = (e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): BrowserWindow | null =>
      BrowserWindow.fromWebContents(e.sender)
    page.handle(LibraryChannel.load, () => library.load())
    page.handle(LibraryChannel.get, () => library.library())
    page.handle(LibraryChannel.addFolder, (e) => library.addFolder(window(e)))
    page.handle(LibraryChannel.addDropped, (_, paths) => library.addDropped(paths))
    page.on(LibraryChannel.removeFolder, (_, path) => library.removeFolder(path))
    page.on(LibraryChannel.rescan, () => library.scan(true))
    page.on(LibraryChannel.setArtists, (_, changes) => library.setArtists(changes))
    page.on(LibraryChannel.aiRecheck, () => library.aiRecheck())
    page.handle(LibraryChannel.showFolder, (_, parts) =>
      this.#on ? showFolder(parts, settings.get().folders) : false
    )
  }

  setOn(on: boolean): void {
    this.#on = on
    this.#library?.setOn(on)
    // the audio of a song that was playing; the page leaves it too
    if (!on) stopAllDecoders()
  }

  // None to list: the prune runs in the library process, which keeps the
  // covers of the index and the lookup itself, on or off.
  keptCovers(): string[] {
    return []
  }

  coverSettingChanged(): void {
    const { fetchCovers, coverSources } = this.library.store.live()
    this.library.setFetch(fetchCovers, coverSources)
  }

  windowOpened(): void {
    this.#library?.resume()
  }

  // a hidden cover window would keep the app running with no window
  windowClosed(): void {
    this.#library?.pause()
  }

  playing(on: boolean): void {
    this.#library?.setPlaying(on)
  }

  // an ffmpeg must never outlive the app
  flushSync(): void {
    stopAllDecoders()
  }

  // The library process saves on its own, so quitting waits for its answer.
  flush(): Promise<void> | undefined {
    if (!this.#library || this.#flushed) return undefined
    return this.#library.flush().then(() => {
      this.#flushed = true
    })
  }
}
