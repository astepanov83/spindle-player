// Main's bookkeeping for the library process: requests waiting for a reply,
// the scan asked for, and the status the page sees. Plain TS with the process
// handed in as `post`, so the rules are tested with a fake.
//   - A request to a process that is gone or dies gets an empty answer.
//   - A scan cut short by a crash is asked for again once the new process runs,
//     but only once: a scan that crashes it twice is dropped and shown as failed.
//   - A closed app window stops the scan; it is not asked again.
import { mergeMoves, type IdMoves } from '../../shared/id-moves'
import type { ScanStatus } from '../../shared/library'
import type { FullLibrary } from '../../shared/library-patch'
import type { WorkerIn, WorkerOut } from './types'
import type { AfterExit } from './library-process'

export type Reply = Extract<WorkerOut, { type: 'reply' }>
export type Ask =
  | { type: 'find-track'; id: string }
  | { type: 'cover-source'; hash: string }
  | { type: 'get-library' }

// What the page gets when the process can't give it a library.
// No epoch a process makes, so a patch from a process that comes back later
// makes the page ask for the whole library.
export const emptyLibrary = (): Uint8Array =>
  new TextEncoder().encode(
    JSON.stringify({ epoch: '', n: 0, albums: [], tracks: [] } satisfies FullLibrary)
  )

export interface ClientOptions {
  // false when there is no process to take it
  post(m: WorkerIn): boolean
  // the status changed: tell the page
  send(status: ScanStatus): void
  // the music folders as saved now
  folders(): string[]
  // false when settings.json could not be read, so the folder list is unknown
  canScan: boolean
  // Track ids changed: rename them in playlists.json and queue.json and write
  // both before returning, since the library process is told right after.
  // False when a write failed: the process keeps the map and sends it again.
  idsMoved?(moves: IdMoves): boolean
  log?(text: string): void
}

export class LibraryClient {
  #nextReq = 0
  #replies = new Map<number, (m: Reply) => void>()
  #status: ScanStatus
  #nextScan = 0
  // asked for and not ended yet; `again` once it was asked again after a crash
  #scan: { id: number; retryFailed: boolean; again: boolean } | undefined
  // a scan crashed the process twice; shown until the next scan is asked for
  #scanCrashed = false
  // the process gave a library at least once this run
  #loaded = false
  // every id map this run, for a restarted process (see WorkerStart.aliases)
  #aliases: IdMoves = {}
  #log: (text: string) => void

  constructor(readonly o: ClientOptions) {
    this.#log = o.log ?? ((t) => console.error(t))
    this.#status = {
      folders: o.folders(),
      phase: 'idle',
      done: 0,
      total: 0,
      tracks: 0,
      albums: 0,
      failed: 0,
      missing: []
    }
    if (!o.canScan) this.#status.settingsUnreadable = true
  }

  get status(): ScanStatus {
    return this.#status
  }

  get aliases(): IdMoves {
    return this.#aliases
  }

  setStatus(change: Partial<ScanStatus>): void {
    this.#status = { ...this.#status, ...change }
    this.o.send(this.#status)
  }

  // An answer from the process; an empty one if there is none or it dies first.
  ask(m: Ask): Promise<Reply> {
    const req = ++this.#nextReq
    return new Promise<Reply>((r) => {
      this.#replies.set(req, r)
      if (!this.o.post({ ...m, req })) {
        this.#replies.delete(req)
        r({ type: 'reply', req })
      }
    })
  }

  // The library as it is now, for the page's first paint or a reload. Asks
  // again after a restart; an empty library if there is no process.
  async library(): Promise<Uint8Array> {
    let library: Uint8Array | undefined
    for (let i = 0; i < 4 && !library; i++) library = (await this.ask({ type: 'get-library' })).data
    if (library) this.#loaded = true
    return library ?? emptyLibrary()
  }

  // Handles the messages this class owns; false for the rest.
  onMessage(m: WorkerOut): boolean {
    switch (m.type) {
      case 'reply':
        this.#replies.get(m.req)?.(m)
        this.#replies.delete(m.req)
        return true
      case 'status':
        // the process doesn't know what main sets
        this.#status = {
          ...m.status,
          scanFailed: m.status.scanFailed || this.#scanCrashed || undefined,
          settingsUnreadable: this.#status.settingsUnreadable,
          unavailable: this.#status.unavailable
        }
        for (const k of ['scanFailed', 'settingsUnreadable', 'unavailable'] as const)
          if (this.#status[k] === undefined) delete this.#status[k]
        this.o.send(this.#status)
        return true
      case 'scanned':
        if (this.#scan?.id === m.id) this.#scan = undefined
        return true
      case 'library':
        this.#loaded = true
        return false
      case 'ids-moved':
        this.#aliases = mergeMoves(this.#aliases, m.moves)
        // the files first; then the process may drop the map from its index
        if (this.o.idsMoved?.(m.moves) ?? true) this.o.post({ type: 'ids-saved', moves: m.moves })
        else
          this.#log(
            'Library: playlists or queue could not be saved with the new ids; kept for the next start'
          )
        return true
      default:
        return false
    }
  }

  // A scan already running stops; what it read stays. Files that failed last
  // time are read again only on a manual Rescan (retryFailed).
  scan(retryFailed: boolean): void {
    // The folder list on disk is unknown, and a scan of the defaults (no
    // folders) would empty the index and delete the covers.
    if (!this.o.canScan) {
      this.#log('Library: settings.json could not be read, so the folders are not scanned')
      return
    }
    this.#scanCrashed = false
    this.#scan = { id: ++this.#nextScan, retryFailed, again: false }
    this.#postScan()
  }

  #postScan(): void {
    const s = this.#scan
    if (s)
      this.o.post({ type: 'scan', id: s.id, folders: this.o.folders(), retryFailed: s.retryFailed })
  }

  // The app window closed: stop scanning, and don't start that scan again.
  stop(): void {
    this.#scan = undefined
    this.o.post({ type: 'stop' })
  }

  // The process ended; `after` tells what comes next (see LibraryProcess).
  onExit(code: number, after: AfterExit): void {
    // requests to the dead process get an empty answer (a 404 for the page)
    for (const [req, done] of this.#replies) done({ type: 'reply', req })
    this.#replies.clear()
    if (after === 'quitting') return
    if (this.#scan?.again) {
      this.#log('Library: the scan stopped the library process twice; not starting it again')
      this.#scan = undefined
      this.#scanCrashed = true
    } else if (this.#scan) this.#scan.again = true
    const change: Partial<ScanStatus> = { phase: 'idle', done: 0, total: 0 }
    if (this.#scanCrashed) change.scanFailed = true
    if (after === 'restarted')
      this.#log(`Library process stopped (code ${code}), starting it again`)
    else {
      this.#log(`Library process stopped (code ${code}) too often; the library stays as it is`)
      this.#scan = undefined
      change.unavailable = this.#loaded ? 'stopped' : 'not-loaded'
    }
    this.setStatus(change)
  }

  // A new process runs: a scan it cut short starts again.
  onStarted(): void {
    if (this.#scan?.again) this.#postScan()
  }
}
