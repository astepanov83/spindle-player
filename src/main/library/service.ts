// Main's side of the library. The library worker owns the index and does the
// heavy work; main passes messages on, runs the folder dialog, and makes covers.
import { join } from 'path'
import type { Worker } from 'worker_threads'
import { app, dialog, type BrowserWindow } from 'electron'
import { LibraryChannel } from '../../shared/ipc'
import type { ScanStatus } from '../../shared/library'
import type { SettingsStore } from '../settings-store'
import { CoverCache } from './cover-cache'
import createLibraryWorker from './library-worker?nodeWorker'
import type { WorkerIn, WorkerOut, WorkerStart } from './types'

type Reply = Extract<WorkerOut, { type: 'reply' }>

export class LibraryService {
  readonly covers: CoverCache
  readonly #worker: Worker
  // the first library the worker sends, from the index on disk
  readonly #first: Promise<Uint8Array>
  #status: ScanStatus
  #scannedOnStart = false
  #nextReq = 0
  #replies = new Map<number, (m: Reply) => void>()

  constructor(
    readonly store: SettingsStore,
    readonly send: (channel: string, data: unknown) => void,
    coverPreload: string,
    dir = app.getPath('userData')
  ) {
    this.covers = new CoverCache(join(dir, 'covers'), coverPreload)
    const folders = store.get().folders
    this.#status = {
      folders,
      phase: 'idle',
      done: 0,
      total: 0,
      tracks: 0,
      albums: 0,
      failed: 0,
      missing: []
    }
    const start: WorkerStart = {
      indexPath: join(dir, 'library.json'),
      coversDir: this.covers.dir,
      folders
    }
    this.#worker = createLibraryWorker({ workerData: start })
    let gotFirst: (bytes: Uint8Array) => void
    this.#first = new Promise((r) => (gotFirst = r))
    let first = true
    this.#worker.on('message', (m: WorkerOut) => {
      if (m.type === 'library' && first) {
        first = false
        gotFirst(m.bytes)
        return
      }
      this.#onMessage(m)
    })
    this.#worker.on('error', (e) => console.error('Library worker failed', e))
  }

  #post(m: WorkerIn): void {
    this.#worker.postMessage(m)
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
        void this.covers
          .add(m.hash, m.data)
          .then((ok) => this.#post({ type: 'cover-done', hash: m.hash, ok }))
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

  #ask(
    m: { type: 'find-track'; id: string } | { type: 'cover-source'; hash: string }
  ): Promise<Reply> {
    const req = ++this.#nextReq
    return new Promise<Reply>((r) => {
      this.#replies.set(req, r)
      this.#post({ ...m, req })
    })
  }

  // The library for the page's first paint. Starts the scan on start.
  async load(): Promise<{ library: Uint8Array; status: ScanStatus }> {
    const library = await this.#first
    // after the reply is on its way, so the scan doesn't delay the first paint
    if (!this.#scannedOnStart) {
      this.#scannedOnStart = true
      setTimeout(() => this.scan(), 0)
    }
    return { library, status: this.#status }
  }

  // A scan already running stops; what it read stays.
  scan(): void {
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
}
