// Resized covers on disk, named by the hash of the source picture.
// "<hash>.jpg" is the small one made at scan time, "<hash>-large.jpg" is made
// the first time the stage asks for it, and "<hash>.bad" marks a picture that
// could not be decoded, so it is not tried again on every scan.
//
// Decoding happens in a hidden window (Chromium decodes images off its main
// thread), not in main: a 3000px cover took about 50ms of main's time with
// nativeImage. sharp is out too: on Linux it clashes with the glib Electron
// loads, in main, in a worker and in a utilityProcess alike.
import { mkdirSync } from 'fs'
import { rename, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { BrowserWindow, ipcMain } from 'electron'
import { CoverChannel, type CoverJob, type CoverResult } from '../../shared/cover-job'

export const smallSide = 320
export const largeSide = 1000
// Pictures in the hidden window at once. Decoding is off its main thread; four was faster than two.
const jobsAtOnce = 4
// The hidden window closes after this long with nothing to do.
const idleMs = 30000

export function isCoverHash(s: string): boolean {
  return /^[0-9a-f]{40}$/.test(s)
}

async function writeAtomic(path: string, data: Uint8Array | string): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, data)
  await rename(tmp, path)
}

export class CoverCache {
  #win: BrowserWindow | undefined
  #loaded: Promise<void> | undefined
  #waiting = new Map<number, (jpg: Uint8Array | undefined) => void>()
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
      this.#waiting.get(r.id)?.(r.jpg)
      this.#waiting.delete(r.id)
    })
  }

  smallPath(hash: string): string {
    return join(this.dir, `${hash}.jpg`)
  }

  #window(): Promise<void> {
    if (this.#win && !this.#win.isDestroyed() && this.#loaded) return this.#loaded
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
      if (this.#win === win) this.#win = undefined
      // anything still waiting gets no picture
      for (const done of this.#waiting.values()) done(undefined)
      this.#waiting.clear()
    })
    this.#loaded = win.loadURL('about:blank')
    return this.#loaded
  }

  // Scales so the shorter side is `side`, never up, as JPEG. undefined if it can't be decoded.
  async resize(data: Uint8Array, side: number): Promise<Uint8Array | undefined> {
    if (this.#running >= jobsAtOnce) await new Promise<void>((r) => this.#queue.push(r))
    this.#running++
    clearTimeout(this.#idle)
    try {
      await this.#window()
      const id = ++this.#nextId
      const result = new Promise<Uint8Array | undefined>((r) => this.#waiting.set(id, r))
      const job: CoverJob = { id, data, side }
      this.#win!.webContents.send(CoverChannel.job, job)
      return await result
    } catch (e) {
      console.error('Could not resize a cover', e)
      return undefined
    } finally {
      this.#running--
      this.#queue.shift()?.()
      if (!this.#running) this.#idle = setTimeout(() => this.close(), idleMs)
    }
  }

  // Makes the small cover. true if it was written, false if the picture is bad.
  async add(hash: string, data: Uint8Array): Promise<boolean> {
    try {
      const jpg = await this.resize(data, smallSide)
      if (jpg) await writeAtomic(this.smallPath(hash), jpg)
      else await writeAtomic(join(this.dir, `${hash}.bad`), '')
      return !!jpg
    } catch (e) {
      console.error('Could not save a cover', e)
      return false
    }
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
      const jpg = data && (await this.resize(data, largeSide))
      if (!jpg) return undefined
      await writeAtomic(path, jpg)
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
    if (win && !win.isDestroyed()) win.destroy()
  }
}
