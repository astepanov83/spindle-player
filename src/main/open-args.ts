// Files and folders given to Spindle by the system (ticket 124): "Open with",
// a double-click on a song once Spindle is picked for it, or
// `spindle song.flac` on the command line. A second copy hands its own over
// to the running one (see index.ts) and quits.
import { isAbsolute, resolve } from 'path'
import { fileURLToPath } from 'url'

// More than "Open with" ever gives; a longer list is cut.
export const maxOpened = 1000

// The paths in a command line. `skip`: the program, and in dev the app's
// folder. Chromium's and Electron's flags are left out, and after "--" every
// word is a path. A relative path is from `cwd`, the caller's folder. Some
// file managers give file:// URLs.
export function openArgs(argv: readonly string[], cwd: string, skip: number): string[] {
  const out: string[] = []
  let flags = true
  for (const arg of argv.slice(skip)) {
    if (flags && arg === '--') {
      flags = false
      continue
    }
    if (!arg || (flags && arg.startsWith('-'))) continue
    let path = arg
    if (/^file:\/\//i.test(arg)) {
      try {
        path = fileURLToPath(arg)
      } catch {
        continue
      }
    }
    path = resolve(cwd, path)
    if (!out.includes(path)) out.push(path)
    if (out.length === maxOpened) break
  }
  return out
}

// Paths another copy sent with its lock request (see single-instance.ts),
// checked, as they come from outside: absolute paths only.
export function parseOpened(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v
    .filter((p): p is string => typeof p === 'string' && p.length <= 4096 && isAbsolute(p))
    .slice(0, maxOpened)
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export interface BatchTimers {
  set(f: () => void, ms: number): () => void
  now(): number
}

const realTimers: BatchTimers = {
  set: (f, ms) => {
    const t = setTimeout(f, ms)
    return () => clearTimeout(t)
  },
  now: () => Date.now()
}

// Launches that come close together are one open. Windows' Explorer starts
// one copy per file for "Open with" on several files, in no set order, so
// paths from more than one launch are sorted by path. One launch keeps the
// order it gave. A batch ends `quietMs` after its last launch, and at the
// latest `maxMs` after its first.
export class OpenBatch {
  #paths: string[] = []
  #launches = 0
  #first = 0
  #cancel: (() => void) | undefined

  constructor(
    private readonly done: (paths: string[]) => void,
    private readonly quietMs = 500,
    private readonly maxMs = 3000,
    private readonly timers: BatchTimers = realTimers
  ) {}

  add(paths: string[]): void {
    if (!paths.length) return
    const now = this.timers.now()
    if (!this.#launches) this.#first = now
    this.#launches++
    for (const p of paths) if (!this.#paths.includes(p)) this.#paths.push(p)
    this.#cancel?.()
    const wait = Math.max(0, Math.min(this.quietMs, this.#first + this.maxMs - now))
    this.#cancel = this.timers.set(() => this.#end(), wait)
  }

  #end(): void {
    const paths = this.#paths.slice(0, maxOpened)
    if (this.#launches > 1) paths.sort(collator.compare)
    this.#paths = []
    this.#launches = 0
    this.#cancel = undefined
    this.done(paths)
  }
}
