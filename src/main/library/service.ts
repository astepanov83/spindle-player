// Main's side of the library. The library worker owns the index and does the
// heavy work; main passes messages on, runs the folder dialog, and makes covers.
import { join } from 'path'
import type { Worker } from 'worker_threads'
import { app, dialog, type BrowserWindow } from 'electron'
import { LibraryChannel } from '../../shared/ipc'
import type { ScanStatus } from '../../shared/library'
import type { SettingsStore } from '../settings-store'
import { CoverCache } from './cover-cache'
import { RestartBudget } from './restart'
import createLibraryWorker from './library-worker?nodeWorker'
import type { WorkerIn, WorkerOut, WorkerStart } from './types'

type Reply = Extract<WorkerOut, { type: 'reply' }>
type Ask =
  | { type: 'find-track'; id: string }
  | { type: 'cover-source'; hash: string }
  | { type: 'get-library' }

// What the page gets when the worker can't give it a library.
const emptyLibrary = (): Uint8Array =>
  new TextEncoder().encode(JSON.stringify({ albums: [], tracks: [] }))

// At quit, main waits this long at most for the worker to save the index.
const flushWaitMs = 2000

export class LibraryService {
  readonly covers: CoverCache
  #worker: Worker | undefined
  #flushFlag = new Int32Array(new SharedArrayBuffer(4))
  // a worker that dies is started again a few times, then left dead
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
    const shared = new SharedArrayBuffer(4)
    this.#flushFlag = new Int32Array(shared)
    const start: WorkerStart = {
      indexPath: join(this.dir, 'library.json'),
      coversDir: this.covers.dir,
      folders: this.store.get().folders,
      flushFlag: shared
    }
    const worker = createLibraryWorker({ workerData: start })
    this.#worker = worker
    worker.on('message', (m: WorkerOut) => {
      if (this.#worker === worker) this.#onMessage(m)
    })
    worker.on('error', (e) => console.error('Library worker failed', e))
    worker.on('exit', (code) => {
      if (this.#worker !== worker) return
      this.#worker = undefined
      // requests to the dead worker get an empty answer (a 404 for the page)
      for (const [req, done] of this.#replies) done({ type: 'reply', req })
      this.#replies.clear()
      if (this.#quitting) return
      this.#setStatus({ phase: 'idle', done: 0, total: 0 })
      if (this.#restarts.take(Date.now())) {
        console.error(`Library worker stopped (code ${code}), starting it again`)
        this.#start()
      } else {
        console.error(`Library worker stopped (code ${code}) too often; the library stays empty`)
      }
    })
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
      setTimeout(() => this.scan(), 0)
    }
    return { library: library ?? emptyLibrary(), status: this.#status }
  }

  // A scan already running stops; what it read stays.
  scan(): void {
    // The folder list on disk is unknown, and a scan of the defaults (no
    // folders) would empty the index and delete the covers.
    if (!this.store.readable) {
      console.error('Library: settings.json could not be read, so the folders are not scanned')
      return
    }
    this.#post({ type: 'scan', folders: this.store.get().folders })
  }

  async addFolder(win: BrowserWindow | null): Promise<void> {
    const options: Electron.OpenDialogOptions = {
      title: 'Add music folder',
      buttonLabel: 'Add',
      properties: ['openDirectory', 'multiSelections']
    }
    const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (r.canceled || !r.filePaths.length) return
    this.store.setFolders([...this.store.get().folders, ...r.filePaths])
    this.scan()
  }

  removeFolder(path: unknown): void {
    const folders = this.store.get().folders
    if (typeof path !== 'string' || !folders.includes(path)) return
    this.store.setFolders(folders.filter((f) => f !== path))
    this.scan()
  }

  // Only files in the index are served, by id; never a path from the page.
  async trackPath(id: string): Promise<string | undefined> {
    return (await this.#ask({ type: 'find-track', id })).path
  }

  // The picture a cover hash was made from, to make the large size.
  async coverSource(hash: string): Promise<Uint8Array | undefined> {
    return (await this.#ask({ type: 'cover-source', hash })).data
  }

  // Quitting: lets the worker write the index, waiting a short while at most.
  flushSync(): void {
    this.#quitting = true
    const flag = this.#flushFlag
    Atomics.store(flag, 0, 0)
    if (!this.#post({ type: 'flush' })) return
    if (Atomics.wait(flag, 0, 0, flushWaitMs) === 'timed-out')
      console.error('Library index: the worker did not save in time')
  }
}
