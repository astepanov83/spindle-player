// Main's side of the library. The library process owns the index and does the
// heavy work; main passes messages on, runs the folder dialog, and makes covers.
// The bookkeeping (replies, the scan asked for, the status) is in library-client.ts.
import { join } from 'path'
import { app, dialog, utilityProcess, type BrowserWindow } from 'electron'
import { LibraryChannel } from '../../shared/ipc'
import type { IdMoves } from '../../shared/id-moves'
import type { ScanStatus } from '../../shared/library'
import type { CoverSource } from '../../shared/settings'
import { ffmpegTool } from '../ffmpeg-path'
import type { SettingsStore } from '../settings-store'
import { CoverCache } from './cover-cache'
import { LibraryClient } from './library-client'
import { LibraryProcess } from './library-process'
import { RestartBudget } from './restart'
import libraryProcessPath from './library-worker?modulePath'
import type { MediaInfo, WorkerIn, WorkerOut } from './types'

// At quit, main waits this long at most for the library process to save the index.
const flushWaitMs = 2000
// Its own libuv pool: listings, stats and reads at once, plus room for lookups.
const libraryPoolSize = '8'

export class LibraryService {
  readonly covers: CoverCache
  // the bundled decoders; without them APE, WMA and the like don't play
  readonly ffmpeg = ffmpegTool('ffmpeg')
  readonly ffprobe = ffmpegTool('ffprobe')
  #proc: LibraryProcess
  #client: LibraryClient
  #playing = false
  // device of the last audio file the page opened
  #playingDev: number | undefined
  #scannedOnStart = false

  constructor(
    readonly store: SettingsStore,
    readonly send: (channel: string, data: unknown) => void,
    // track ids that changed: main renames them in its playlists and queue
    // files and writes them before it returns
    // (false when a write failed, so the library process keeps the map)
    readonly idsMoved: (moves: IdMoves) => boolean,
    coverPreload: string,
    readonly dir = app.getPath('userData')
  ) {
    this.covers = new CoverCache(join(dir, 'covers'), coverPreload)
    if (!this.ffmpeg || !this.ffprobe)
      console.error(
        'ffmpeg or ffprobe not found (npm run fetch-ffmpeg); APE, WMA and the like will not play'
      )
    this.#client = new LibraryClient({
      post: (m) => this.#post(m),
      send: (s) => this.send(LibraryChannel.status, s),
      folders: () => this.store.get().folders,
      canScan: store.readable,
      idsMoved: (moves) => {
        // the page renames them too, as the library with the new ids comes
        this.send(LibraryChannel.idsMoved, moves)
        return this.idsMoved(moves)
      }
    })
    this.#proc = new LibraryProcess(
      () =>
        utilityProcess.fork(libraryProcessPath, [], {
          serviceName: 'Spindle library',
          env: { ...process.env, UV_THREADPOOL_SIZE: libraryPoolSize }
        }),
      () => ({
        indexPath: join(this.dir, 'library.json'),
        coversDir: this.covers.dir,
        folders: this.store.get().folders,
        ffprobe: this.ffprobe,
        aliases: this.#client.aliases,
        // live: with settings.json unreadable, the page's choice still counts this run
        fetch: { on: this.store.live().fetchCovers, sources: this.store.live().coverSources },
        fetchedPath: join(this.dir, 'fetched-covers.json'),
        userAgent: `Spindle/${app.getVersion()} (https://github.com/astepanov83/spindle-player)`
      }),
      // a library process that dies is started again a few times, then left dead
      new RestartBudget(3, 60000),
      {
        message: (m) => this.#onMessage(m),
        exit: (code, after) => this.#client.onExit(code, after),
        // a new process starts at full speed; tell it if a song is playing
        started: () => {
          if (this.#playing) this.#sendPlaying()
          this.#client.onStarted()
        }
      },
      flushWaitMs
    )
    this.#proc.start()
  }

  #post(m: WorkerIn): boolean {
    // the client is made first, so the process may not exist yet
    return this.#proc?.post(m) ?? false
  }

  #onMessage(m: WorkerOut): void {
    if (this.#client.onMessage(m)) return
    switch (m.type) {
      case 'library':
        // JSON bytes the page parses; main never reads them
        this.send(LibraryChannel.changed, m.bytes)
        break
      case 'cover':
        void (
          m.paletteOnly ? this.covers.palette(m.hash, m.data) : this.covers.add(m.hash, m.data)
        ).then((done) => this.#post({ type: 'cover-done', hash: m.hash, ...done }))
        break
      case 'log':
        console.info(m.text)
        break
    }
  }

  // The library as it is now, for the page's first paint or a reload.
  async load(): Promise<{ library: Uint8Array; status: ScanStatus; moves: IdMoves }> {
    const library = await this.#client.library()
    // after the reply is on its way, so the scan doesn't delay the first paint
    if (!this.#scannedOnStart) {
      this.#scannedOnStart = true
      setTimeout(() => this.scan(false), 0)
    }
    // every id map of the run: one sent at start may have come before the page listened
    return { library, status: this.#client.status, moves: this.#client.aliases }
  }

  // A scan already running stops; what it read stays. Files that failed last
  // time are read again only on a manual Rescan (retryFailed).
  scan(retryFailed: boolean): void {
    this.#client.scan(retryFailed)
  }

  // The app window closed: no more scanning or covers until a new one opens,
  // so nothing keeps the app running with no window.
  pause(): void {
    this.covers.shutDown()
    this.setPlaying(false)
    this.#client.stop()
  }

  // The page's play state: while a song plays from a disk being scanned, the
  // scan slows down.
  setPlaying(playing: boolean): void {
    if (playing === this.#playing) return
    this.#playing = playing
    this.#sendPlaying()
  }

  // The page opened an audio file on this device (st_dev).
  mediaOpened(dev: number): void {
    if (dev === this.#playingDev) return
    this.#playingDev = dev
    if (this.#playing) this.#sendPlaying()
  }

  #sendPlaying(): void {
    this.#post({ type: 'playing', playing: this.#playing, dev: this.#playingDev })
  }

  // The online cover lookup setting changed.
  setFetch(on: boolean, sources: Record<CoverSource, boolean>): void {
    this.#post({ type: 'fetch-covers', on, sources })
  }

  resume(): void {
    this.covers.allow()
  }

  async addFolder(win: BrowserWindow | null): Promise<void> {
    // the list would change in memory only (the page greys the button out too)
    if (!this.store.readable) return
    const options: Electron.OpenDialogOptions = {
      title: 'Add music folder',
      buttonLabel: 'Add',
      properties: ['openDirectory', 'multiSelections']
    }
    const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (r.canceled || !r.filePaths.length) return
    this.#setFolders([...this.store.get().folders, ...r.filePaths])
  }

  removeFolder(path: unknown): void {
    if (!this.store.readable) return
    const folders = this.store.get().folders
    if (typeof path !== 'string' || !folders.includes(path)) return
    this.#setFolders(folders.filter((f) => f !== path))
  }

  // The status carries the list the settings sheet shows. It is set here too,
  // since a process that is gone for good sends no more status.
  #setFolders(folders: string[]): void {
    this.store.setFolders(folders)
    this.#client.setStatus({ folders: this.store.get().folders })
    this.scan(false)
  }

  // Only files in the index are served, by id; never a path from the page.
  async mediaInfo(id: string): Promise<MediaInfo | undefined> {
    return (await this.#client.ask({ type: 'find-track', id })).media
  }

  // The picture a cover hash was made from, to make the large size.
  async coverSource(hash: string): Promise<Uint8Array | undefined> {
    return (await this.#client.ask({ type: 'cover-source', hash })).data
  }

  // Quitting: lets the library process write the index, waiting a short while
  // at most (see LibraryProcess).
  flush(): Promise<void> {
    return this.#proc.flush()
  }
}
