// Resized covers on disk, named by the hash of the source picture.
// "<hash>.jpg" is the small one made at scan time, "<hash>-large.jpg" is made
// the first time the stage asks for it, and "<hash>.bad" marks a picture that
// could not be decoded, so it is not tried again on every scan. The album
// colors are picked in the same window while the picture is decoded.
//
// Decoding happens in a hidden window (Chromium decodes images off its main
// thread), not in main: a 3000px cover took about 50ms of main's time with
// nativeImage. sharp is out too: on Linux it clashes with the glib Electron
// loads, in main, in a worker and in a utilityProcess alike.
import { mkdirSync } from 'fs'
import { rename, rm, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { BrowserWindow, ipcMain } from 'electron'
import { CoverChannel, type CoverJob, type CoverResult } from '../../shared/cover-job'
import type { ThemePalettes } from '../../shared/palette'
import { outcomeOf, PendingJobs, type Outcome } from './cover-jobs'

export const smallSide = 320
export const largeSide = 1000
// Pictures in the hidden window at once. Decoding is off its main thread; four was faster than two.
const jobsAtOnce = 4
// The hidden window closes after this long with nothing to do.
const idleMs = 30000
// A job with no answer after this long ends as "retry", and the window is dropped.
// A 3000px picture takes well under a second.
const jobTimeoutMs = 20000

// What a job for the library worker ended as. rebuild: the cached small cover
// can't be decoded and was deleted, so the next scan makes it again from the source.
export interface CoverDone {
  result: 'ok' | 'bad' | 'retry' | 'rebuild'
  palette?: ThemePalettes
}

export function isCoverHash(s: string): boolean {
  return /^[0-9a-f]{40}$/.test(s)
}

let tmpCount = 0
async function writeAtomic(path: string, data: Uint8Array | string): Promise<void> {
  // unique per write, so two writes of one file never share a temp file
  const tmp = `${path}.${process.pid}.${++tmpCount}.tmp`
  await writeFile(tmp, data)
  await rename(tmp, path)
}

export class CoverCache {
  #win: BrowserWindow | undefined
  #loaded: Promise<void> | undefined
  #jobs = new PendingJobs(jobTimeoutMs, () => this.#drop('a cover job got no answer'))
  #queue: (() => void)[] = []
  #running = 0
  #nextId = 0
  #idle: ReturnType<typeof setTimeout> | undefined
  #large = new Map<string, Promise<string | undefined>>()

  constructor(
    readonly dir: string,
    readonly preload: string
  ) {
    mkdirSync(dir, { recursive: true })
    ipcMain.on(CoverChannel.done, (e, r: CoverResult) => {
      if (!this.#win || e.sender !== this.#win.webContents) return
      this.#jobs.settle(r.id, outcomeOf(r))
    })
  }

  smallPath(hash: string): string {
    return join(this.dir, `${hash}.jpg`)
  }

  // The hidden window, made on first use and again after it closed, crashed or failed to load.
  #window(): Promise<BrowserWindow> {
    const win0 = this.#win
    if (win0 && !win0.isDestroyed() && this.#loaded) return this.#loaded.then(() => win0)
    const win = new BrowserWindow({
      show: false,
      width: 64,
      height: 64,
      webPreferences: {
        preload: this.preload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    })
    this.#win = win
    win.on('closed', () => {
      if (this.#win !== win) return
      this.#win = undefined
      this.#loaded = undefined
      this.#jobs.failAll()
    })
    win.webContents.on('render-process-gone', (_, d) => {
      if (this.#win === win) this.#drop(`the cover window stopped (${d.reason})`)
    })
    const loaded = win.loadURL('about:blank')
    this.#loaded = loaded
    // a failed load is not kept: the next job makes a new window
    loaded.catch(() => {
      if (this.#win === win) this.#drop('the cover window did not load')
    })
    return loaded.then(() => win)
  }

  // Closes the window; jobs still waiting end as "retry", not as bad pictures.
  #drop(why: string): void {
    console.error(`Covers: ${why}; the pictures are tried again on the next scan`)
    const win = this.#win
    this.#win = undefined
    this.#loaded = undefined
    this.#jobs.failAll()
    if (win && !win.isDestroyed()) win.destroy()
  }

  // Runs one job in the hidden window: a JPEG scaled so the shorter side is
  // `side` (never up), the palette, or both.
  async #run(data: Uint8Array, want: Omit<CoverJob, 'id' | 'data'>): Promise<Outcome> {
    if (this.#running >= jobsAtOnce) await new Promise<void>((r) => this.#queue.push(r))
    this.#running++
    clearTimeout(this.#idle)
    try {
      const win = await this.#window()
      const id = ++this.#nextId
      const result = this.#jobs.wait(id)
      const job: CoverJob = { id, data, ...want }
      win.webContents.send(CoverChannel.job, job)
      return await result
    } catch (e) {
      // the window went away or never loaded: nothing is known about the picture
      console.error('Could not resize a cover', e)
      return { kind: 'retry' }
    } finally {
      this.#running--
      this.#queue.shift()?.()
      if (!this.#running) this.#idle = setTimeout(() => this.close(), idleMs)
    }
  }

  // Makes the small cover and picks its palette. A "bad" marker is written
  // only when the picture itself can't be decoded.
  async add(hash: string, data: Uint8Array): Promise<CoverDone> {
    try {
      const o = await this.#run(data, { side: smallSide, palette: true })
      if (o.kind === 'ok' && o.jpg) {
        await writeAtomic(this.smallPath(hash), o.jpg)
        return { result: 'ok', palette: o.palette }
      }
      if (o.kind === 'bad') await writeAtomic(join(this.dir, `${hash}.bad`), '')
      return { result: o.kind === 'bad' ? 'bad' : 'retry' }
    } catch (e) {
      console.error('Could not save a cover', e)
      return { result: 'retry' }
    }
  }

  // Only the palette, for a cover cached before palettes were picked.
  async palette(hash: string, data: Uint8Array): Promise<CoverDone> {
    const o = await this.#run(data, { palette: true })
    if (o.kind === 'ok' && o.palette) return { result: 'ok', palette: o.palette }
    if (o.kind === 'bad')
      try {
        await rm(this.smallPath(hash), { force: true })
        return { result: 'rebuild' }
      } catch (e) {
        console.error('Could not delete a broken cover', e)
      }
    // tried again on the next scan
    return { result: 'retry' }
  }

  // The big cover's path, made from `source` the first time.
  large(hash: string, source: () => Promise<Uint8Array | undefined>): Promise<string | undefined> {
    let p = this.#large.get(hash)
    if (!p) {
      p = this.#makeLarge(hash, source)
      this.#large.set(hash, p)
      // a failure may be a file that is back later; a success may be pruned later
      p.finally(() => this.#large.delete(hash))
    }
    return p
  }

  async #makeLarge(
    hash: string,
    source: () => Promise<Uint8Array | undefined>
  ): Promise<string | undefined> {
    const path = join(this.dir, `${hash}-large.jpg`)
    try {
      await stat(path)
      return path
    } catch {
      // not made yet
    }
    try {
      const data = await source()
      const o = data && (await this.#run(data, { side: largeSide }))
      if (!o || o.kind !== 'ok' || !o.jpg) return undefined
      await writeAtomic(path, o.jpg)
      return path
    } catch (e) {
      console.error('Could not make a large cover', e)
      return undefined
    }
  }

  close(): void {
    clearTimeout(this.#idle)
    const win = this.#win
    this.#win = undefined
    this.#loaded = undefined
    this.#jobs.failAll()
    if (win && !win.isDestroyed()) win.destroy()
  }
}
