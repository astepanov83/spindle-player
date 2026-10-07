// While a music folder is missing (a drive not mounted, a NAS share down),
// looks every 30 s whether it is back, and asks for a scan when one is, so its
// songs can play again with no Rescan or restart. Main never watches folders
// otherwise: the library is scanned at start and on Rescan.
import { readdir } from 'fs/promises'
import type { ScanStatus } from '../../../shared/library'

export const recheckMs = 30_000
// a network mount that hangs must not hold the check
const answerMs = 5_000

export interface MissingWatchDeps {
  // the folder lists at least one entry (an unmounted drive often leaves an
  // empty mount point, which the scan counts as missing too)
  hasEntries(dir: string): Promise<boolean>
  scan(): void
  // the plugin is on and a window is open
  canScan(): boolean
}

export class MissingWatch {
  #missing: string[] = []
  #idle = true
  #timer: ReturnType<typeof setTimeout> | undefined
  #checking = false
  // Folders a scan was asked for while they had entries. Such a folder can
  // still be missing after it (it holds no music now): it is not scanned for
  // again until it has been empty or gone once, or this would scan every 30 s.
  #tried = new Set<string>()

  constructor(
    readonly d: MissingWatchDeps,
    readonly every = recheckMs
  ) {}

  // Each status main sends to the page.
  update(s: ScanStatus): void {
    this.#missing = s.missing
    this.#idle = s.phase === 'idle'
    for (const f of this.#tried) if (!s.missing.includes(f)) this.#tried.delete(f)
    if (this.#missing.length && this.#idle) this.#arm()
    else this.stop()
  }

  stop(): void {
    clearTimeout(this.#timer)
    this.#timer = undefined
  }

  #arm(): void {
    if (this.#timer || this.#checking) return
    this.#timer = setTimeout(() => {
      this.#timer = undefined
      void this.#check()
    }, this.every)
  }

  async #check(): Promise<void> {
    // the next status arms it again
    if (!this.d.canScan() || !this.#idle || !this.#missing.length) return
    this.#checking = true
    const folders = this.#missing
    const there = await Promise.all(folders.map((f) => this.d.hasEntries(f).catch(() => false)))
    this.#checking = false
    const back = folders.filter((f, i) => there[i] && !this.#tried.has(f))
    folders.forEach((f, i) => {
      if (!there[i]) this.#tried.delete(f)
    })
    if (back.length && this.d.canScan()) {
      for (const f of back) this.#tried.add(f)
      // its statuses arm the watch again if a folder is still missing
      this.d.scan()
    } else this.#arm()
  }
}

export async function hasEntries(dir: string): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<boolean>(
    (resolve) => (timer = setTimeout(() => resolve(false), answerMs))
  )
  try {
    return await Promise.race([readdir(dir).then((names) => names.length > 0), late])
  } finally {
    clearTimeout(timer)
  }
}
