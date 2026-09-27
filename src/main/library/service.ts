// Main's side of the library: the index on disk, scans in a worker thread,
// and what the page and the spindle:// protocol ask for.
import { readFile } from 'fs/promises'
import { join } from 'path'
import type { Worker } from 'worker_threads'
import { app, dialog, type BrowserWindow } from 'electron'
import { parseFile } from 'music-metadata'
import { LibraryChannel } from '../../shared/ipc'
import type { LibraryData, ScanStatus } from '../../shared/library'
import { JsonFileWriter } from '../json-file'
import type { SettingsStore } from '../settings-store'
import { CoverCache } from './cover-cache'
import { buildLibrary, type BuiltLibrary } from './group'
import {
  applyBatch,
  applyListing,
  emptyIndex,
  isUnder,
  parseIndex,
  serializeIndex,
  usedCovers
} from './merge'
import createScanWorker from './scan-worker?nodeWorker'
import { frontCover } from './tags'
import type { LibraryIndex, MainMessage, WorkerMessage, WorkerStart } from './types'

// While a long scan runs, the page gets what is found so far this often.
// Each update sends the whole library, so not more often than this.
const interimMs = 15000

export class LibraryService {
  readonly covers: CoverCache
  readonly #path: string
  readonly #writer: JsonFileWriter<unknown>
  #ix: LibraryIndex = emptyIndex()
  #built: BuiltLibrary = { data: { albums: [], tracks: [] }, paths: new Map() }
  readonly #ready: Promise<void>
  #worker: Worker | undefined
  // bumped per scan, so messages from a stopped worker are dropped
  #scanId = 0
  #scannedOnStart = false
  #scanStart = 0
  #readCount = 0
  // the index changed since the page last got the library
  #dirty = false
  #interim: ReturnType<typeof setInterval> | undefined
  #status: ScanStatus

  constructor(
    readonly store: SettingsStore,
    readonly send: (channel: string, data: unknown) => void,
    dir = app.getPath('userData')
  ) {
    this.#path = join(dir, 'library.json')
    this.covers = new CoverCache(join(dir, 'covers'))
    // one line, since the index can be tens of MB
    this.#writer = new JsonFileWriter(this.#path, 1000, undefined, 0)
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
    this.#ready = this.#readIndex()
  }

  async #readIndex(): Promise<void> {
    try {
      this.#ix = parseIndex(JSON.parse(await readFile(this.#path, 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        console.error(`Library index is broken, scanning again: ${this.#path}`, error)
    }
    this.#rebuild()
  }

  // The library for the page's first paint. Starts the scan on start.
  async load(): Promise<{ library: LibraryData; status: ScanStatus }> {
    await this.#ready
    // after the reply is on its way, so the scan's setup doesn't delay the first paint
    if (!this.#scannedOnStart) {
      this.#scannedOnStart = true
      setTimeout(() => this.scan(), 0)
    }
    return { library: this.#built.data, status: this.#status }
  }

  // Starts a scan. A scan already running is stopped first; what it found stays.
  scan(): void {
    void this.#ready.then(() => this.#startScan())
  }

  #startScan(): void {
    this.#stopWorker()
    const id = ++this.#scanId
    const folders = this.store.get().folders
    const start: WorkerStart = {
      folders,
      known: [...this.#ix.files.values()].map((e) => [e.path, e.mtime, e.size, e.cover ?? '']),
      images: [...this.#ix.images.values()],
      coversDir: this.covers.dir
    }
    const worker = createScanWorker({ workerData: start })
    this.#worker = worker
    this.#scanStart = performance.now()
    this.#readCount = 0
    this.#setStatus({ folders, phase: 'walk', done: 0, total: 0, missing: [] })
    this.#interim = setInterval(() => this.#publish(false), interimMs)

    worker.on('message', (m: WorkerMessage) => {
      if (id !== this.#scanId) return
      this.#onMessage(worker, folders, m)
    })
    worker.on('error', (error) => {
      if (id !== this.#scanId) return
      console.error('Library scan failed', error)
      this.#finish()
    })
    worker.on('exit', () => {
      if (id === this.#scanId && this.#worker === worker) this.#finish()
    })
  }

  #onMessage(worker: Worker, folders: string[], m: WorkerMessage): void {
    switch (m.type) {
      case 'progress':
        this.#setStatus({ phase: m.phase, done: m.done, total: m.total })
        break
      case 'listing':
        if (applyListing(this.#ix, folders, m)) this.#dirty = true
        this.#setStatus({ missing: folders.filter((f) => m.skipped.some((s) => isUnder(f, s))) })
        break
      case 'batch':
        this.#readCount += m.entries.length
        if (applyBatch(this.#ix, m.entries)) this.#dirty = true
        break
      case 'cover':
        void this.covers.add(m.hash, m.data).then(() => {
          const reply: MainMessage = { type: 'cover-done' }
          // the worker may be gone after a rescan
          try {
            worker.postMessage(reply)
          } catch {
            // nothing to tell
          }
        })
        break
      case 'done':
        this.#finish()
        break
    }
  }

  #finish(): void {
    this.#stopWorker()
    this.#publish(true)
    const ms = Math.round(performance.now() - this.#scanStart)
    console.info(
      `Library scan: ${ms} ms, ${this.#readCount} files read, ${this.#status.tracks} songs in ${this.#status.albums} albums`
    )
    this.#setStatus({ phase: 'idle', done: 0, total: 0 })
    void this.covers.prune(usedCovers(this.#ix))
  }

  #stopWorker(): void {
    clearInterval(this.#interim)
    this.#interim = undefined
    const w = this.#worker
    this.#worker = undefined
    void w?.terminate()
  }

  // Sends the library to the page and saves the index, if anything changed.
  #publish(final: boolean): void {
    if (!this.#dirty) return
    this.#rebuild()
    this.send(LibraryChannel.changed, this.#built.data)
    this.#writer.schedule(serializeIndex(this.#ix))
    if (final) void this.#writer.flush()
  }

  #rebuild(): void {
    this.#dirty = false
    this.#built = buildLibrary(this.#ix, (h) => this.covers.has(h))
    let failed = 0
    for (const e of this.#ix.files.values()) if (e.error) failed++
    this.#setStatus({
      tracks: this.#built.data.tracks.length,
      albums: this.#built.data.albums.length,
      failed
    })
  }

  #setStatus(change: Partial<ScanStatus>): void {
    this.#status = { ...this.#status, ...change }
    this.send(LibraryChannel.status, this.#status)
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
    this.#setStatus({ folders: this.store.get().folders })
    this.scan()
  }

  removeFolder(path: unknown): void {
    const folders = this.store.get().folders
    if (typeof path !== 'string' || !folders.includes(path)) return
    this.store.setFolders(folders.filter((f) => f !== path))
    this.#setStatus({ folders: this.store.get().folders })
    this.scan()
  }

  // Only files in the index are served, by id; never a path from the page.
  trackPath(id: string): string | undefined {
    return this.#built.paths.get(id)
  }

  // The picture a cover hash was made from, to make the large size.
  async coverSource(hash: string): Promise<Uint8Array | undefined> {
    for (const im of this.#ix.images.values()) if (im.cover === hash) return readFile(im.path)
    for (const e of this.#ix.files.values()) {
      if (e.cover !== hash) continue
      const meta = await parseFile(e.path, { skipCovers: false })
      return frontCover(meta.common.picture)?.data
    }
    return undefined
  }

  flushSync(): void {
    this.#writer.flushSync()
  }
}
