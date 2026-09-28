// Main's side of the library. The library process owns the index and does the
// heavy work; main passes messages on, runs the folder dialog, and makes covers.
import { join } from 'path'
import { app, dialog, utilityProcess, type BrowserWindow, type UtilityProcess } from 'electron'
import { LibraryChannel } from '../../shared/ipc'
import type { ScanStatus } from '../../shared/library'
import type { SettingsStore } from '../settings-store'
import { CoverCache } from './cover-cache'
import { RestartBudget } from './restart'
import libraryProcessPath from './library-worker?modulePath'
import type { WorkerIn, WorkerOut, WorkerStart } from './types'

type Reply = Extract<WorkerOut, { type: 'reply' }>
type Ask =
  | { type: 'find-track'; id: string }
  | { type: 'cover-source'; hash: string }
  | { type: 'get-library' }

// What the page gets when the worker can't give it a library.
const emptyLibrary = (): Uint8Array =>
  new TextEncoder().encode(JSON.stringify({ albums: [], tracks: [] }))

// At quit, main waits this long at most for the library process to save the index.
const flushWaitMs = 2000
// Its own libuv pool: listings, stats and reads at once, plus room for lookups.
const libraryPoolSize = '8'

export class LibraryService {
  readonly covers: CoverCache
  #worker: UtilityProcess | undefined
  // set once quitting asked for the last save; called when it is done
  #flushed: (() => void) | undefined
  #flushing = Promise.resolve()
  #playing = false
  // device of the last audio file the page opened
  #playingDev: number | undefined
  // a library process that dies is started again a few times, then left dead
  #restarts = new RestartBudget(3, 60000)
  #quitting = false
  #status: ScanStatus
  #scannedOnStart = false
  #nextReq = 0
  #replies = new Map<number, (m: Reply) => void>()

  constructor(
    readonly store: SettingsStore,
    readonly send: (channel: string, data: unknown) => void,
    coverPreload: string,
    readonly dir = app.getPath('userData')
  ) {
    this.covers = new CoverCache(join(dir, 'covers'), coverPreload)
    this.#status = {
      folders: store.get().folders,
      phase: 'idle',
      done: 0,
      total: 0,
      tracks: 0,
      albums: 0,
      failed: 0,
      missing: []
    }
    this.#start()
  }

  #start(): void {
    const start: WorkerStart = {
      indexPath: join(this.dir, 'library.json'),
      coversDir: this.covers.dir,
      folders: this.store.get().folders
    }
    const worker = utilityProcess.fork(libraryProcessPath, [JSON.stringify(start)], {
      serviceName: 'Spindle library',
      env: { ...process.env, UV_THREADPOOL_SIZE: libraryPoolSize }
    })
    this.#worker = worker
    worker.on('message', (m: WorkerOut) => {
      if (this.#worker === worker) this.#onMessage(m)
    })
    worker.on('exit', (code) => {
      if (this.#worker !== worker) return
      this.#worker = undefined
      // requests to the dead process get an empty answer (a 404 for the page)
      for (const [req, done] of this.#replies) done({ type: 'reply', req })
      this.#replies.clear()
      this.#flushed?.()
      if (this.#quitting) return
      this.#setStatus({ phase: 'idle', done: 0, total: 0 })
      if (this.#restarts.take(Date.now())) {
        console.error(`Library process stopped (code ${code}), starting it again`)
        this.#start()
      } else {
        console.error(`Library process stopped (code ${code}) too often; the library stays empty`)
        this.#setStatus({ unavailable: true })
      }
    })
    // a new process starts at full speed; tell it if a song is playing
    if (this.#playing) this.#sendPlaying()
  }

  #post(m: WorkerIn): boolean {
    if (!this.#worker) return false
    this.#worker.postMessage(m)
    return true
  }

  #setStatus(change: Partial<ScanStatus>): void {
    this.#status = { ...this.#status, ...change }
    this.send(LibraryChannel.status, this.#status)
  }

  #onMessage(m: WorkerOut): void {
    switch (m.type) {
      case 'library':
        // JSON bytes the page parses; main never reads them
        this.send(LibraryChannel.changed, m.bytes)
        break
      case 'status':
        this.#status = m.status
        this.send(LibraryChannel.status, m.status)
        break
      case 'cover':
        void (
          m.paletteOnly ? this.covers.palette(m.hash, m.data) : this.covers.add(m.hash, m.data)
        ).then((done) => this.#post({ type: 'cover-done', hash: m.hash, ...done }))
        break
      case 'reply':
        this.#replies.get(m.req)?.(m)
        this.#replies.delete(m.req)
        break
      case 'log':
        console.info(m.text)
        break
      case 'flushed':
        this.#flushed?.()
        break
    }
  }

  // An answer from the worker; an empty one if there is no worker or it dies first.
  #ask(m: Ask): Promise<Reply> {
    const req = ++this.#nextReq
    return new Promise<Reply>((r) => {
      this.#replies.set(req, r)
      if (!this.#post({ ...m, req })) {
        this.#replies.delete(req)
        r({ type: 'reply', req })
      }
    })
  }

  // The library as it is now, for the page's first paint or a reload.
  // Tries again after a worker restart; gives an empty library if there is no worker.
  async load(): Promise<{ library: Uint8Array; status: ScanStatus }> {
    let library: Uint8Array | undefined
    for (let i = 0; i < 4 && !library; i++)
      library = (await this.#ask({ type: 'get-library' })).data
    // after the reply is on its way, so the scan doesn't delay the first paint
    if (!this.#scannedOnStart) {
      this.#scannedOnStart = true
      setTimeout(() => this.scan(false), 0)
    }
    return { library: library ?? emptyLibrary(), status: this.#status }
  }

  // A scan already running stops; what it read stays. Files that failed last
  // time are read again only on a manual Rescan (retryFailed).
  scan(retryFailed: boolean): void {
    // The folder list on disk is unknown, and a scan of the defaults (no
    // folders) would empty the index and delete the covers.
    if (!this.store.readable) {
      console.error('Library: settings.json could not be read, so the folders are not scanned')
      return
    }
    this.#post({ type: 'scan', folders: this.store.get().folders, retryFailed })
  }

  // The app window closed: no more scanning or covers until a new one opens,
  // so nothing keeps the app running with no window.
  pause(): void {
    this.covers.shutDown()
    this.setPlaying(false)
    this.#post({ type: 'stop' })
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

  resume(): void {
    this.covers.allow()
  }

  async addFolder(win: BrowserWindow | null): Promise<void> {
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
    const folders = this.store.get().folders
    if (typeof path !== 'string' || !folders.includes(path)) return
    this.#setFolders(folders.filter((f) => f !== path))
  }

  // The status carries the list the settings sheet shows. It is set here too,
  // since a worker that is gone for good sends no more status.
  #setFolders(folders: string[]): void {
    this.store.setFolders(folders)
    this.#setStatus({ folders: this.store.get().folders })
    this.scan(false)
  }

  // Only files in the index are served, by id; never a path from the page.
  async trackPath(id: string): Promise<string | undefined> {
    return (await this.#ask({ type: 'find-track', id })).path
  }

  // The picture a cover hash was made from, to make the large size.
  async coverSource(hash: string): Promise<Uint8Array | undefined> {
    return (await this.#ask({ type: 'cover-source', hash })).data
  }

  // Quitting: lets the library process write the index, waiting a short while
  // at most. Resolves at once when there is nothing to wait for.
  flush(): Promise<void> {
    this.#quitting = true
    if (this.#flushed) return this.#flushing
    this.#flushing = new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        console.error('Library index: the library process did not save in time')
        resolve()
      }, flushWaitMs)
      this.#flushed = () => {
        clearTimeout(timer)
        resolve()
      }
      if (!this.#post({ type: 'flush' })) this.#flushed()
    })
    return this.#flushing
  }
}
