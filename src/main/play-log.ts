// plays-log.jsonl: a line per counted play (ticket 115), for the stats page
// (ticket 116). plays.json keeps only a count and the last time per song;
// this keeps every play, with the song's names as they were then. Lines are
// only ever added: a play is never rewritten, and moved ids get a line of
// their own that the reader applies to the plays above it.
import {
  appendFileSync,
  closeSync,
  createReadStream,
  fstatSync,
  openSync,
  readSync,
  writeFileSync
} from 'fs'
import { createInterface } from 'readline'
import type { IdMoves } from '../shared/id-moves'
import type { PlayedSong, PlayStats, StatsPeriod } from '../shared/plays'
import type { PluginId } from '../shared/plugins'
import type { ItemKey } from '../shared/plugins/items'
import { keepCopy } from './json-file'
import { parseLogLine, StatsCounter, type MoveLine, type PlayLine } from './play-stats'

// The first line. A file that starts with any other version is left as it is.
const header = { version: 1 }

// fresh: no file yet, or a broken one copied aside: the first write starts it.
// append: lines go at the end. off: the file can't be read, or is of a
// version this build doesn't know; it is neither written nor read this session.
type Mode = 'fresh' | 'append' | 'off'

// The first line is never longer than this.
const headLimit = 4096

function isKnownHeader(line: string): boolean {
  try {
    const v: unknown = JSON.parse(line)
    return typeof v === 'object' && v !== null && (v as { version?: unknown }).version === 1
  } catch {
    return false
  }
}

// How the file at start says to write, and whether its last line was cut off
// (a crash in the middle of a write), so the next line starts on a line of its own.
function openLog(path: string): { mode: Mode; cut: boolean } {
  let fd: number
  try {
    fd = openSync(path, 'r')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { mode: 'fresh', cut: false }
    console.error(`Play log can't be read; not adding to it: ${path}`, error)
    return { mode: 'off', cut: false }
  }
  try {
    const size = fstatSync(fd).size
    if (size === 0) return { mode: 'fresh', cut: false }
    const head = Buffer.alloc(Math.min(size, headLimit))
    readSync(fd, head, 0, head.length, 0)
    const end = head.indexOf(10)
    const first = head.subarray(0, end < 0 ? head.length : end).toString('utf8')
    if (!isKnownHeader(first)) {
      let known = false
      try {
        JSON.parse(first)
        known = true
      } catch {
        // not JSON at all
      }
      if (known) {
        console.error(`Play log has a version this build doesn't know; not adding to it: ${path}`)
        return { mode: 'off', cut: false }
      }
      console.error(`Play log is broken, starting fresh; a copy is kept: ${path}`)
      return { mode: keepCopy(path, `${path}.broken`) ? 'fresh' : 'off', cut: false }
    }
    const last = Buffer.alloc(1)
    readSync(fd, last, 0, 1, size - 1)
    return { mode: 'append', cut: last[0] !== 10 }
  } catch (error) {
    console.error(`Play log can't be read; not adding to it: ${path}`, error)
    return { mode: 'off', cut: false }
  } finally {
    closeSync(fd)
  }
}

export class PlayLog {
  #mode: Mode
  #cut: boolean
  // lines not written yet, each ending in "\n"
  #lines: string[] = []
  #timer: ReturnType<typeof setTimeout> | undefined

  constructor(
    readonly path: string,
    readonly delayMs = 2000,
    readonly onError: (error: unknown) => void = (e) => console.error(`Could not save ${path}`, e)
  ) {
    const o = openLog(path)
    this.#mode = o.mode
    this.#cut = o.cut
  }

  // A play plays.json just counted.
  add(key: ItemKey, song: PlayedSong, at: number): void {
    const line: PlayLine = {
      k: key,
      t: at,
      d: Math.round(song.length * 1000) / 1000,
      a: song.artist,
      al: song.album,
      aa: song.albumArtist,
      ti: song.title
    }
    if (song.artists) line.as = song.artists
    this.#push(line)
  }

  // Written at once, like the other files' moves. False when the write failed.
  moveIds(plugin: PluginId, moves: IdMoves): boolean {
    if (!Object.keys(moves).length) return true
    const line: MoveLine = { moved: plugin, ids: moves }
    this.#push(line)
    return this.flushSync()
  }

  #push(line: PlayLine | MoveLine): void {
    if (this.#mode === 'off') return
    this.#lines.push(JSON.stringify(line) + '\n')
    this.#timer ??= setTimeout(() => this.flushSync(), this.delayMs)
  }

  // Sync even when not quitting: a few short lines, and an append can't be
  // undone, so an async one still running at quit could be lost or doubled.
  flushSync(): boolean {
    clearTimeout(this.#timer)
    this.#timer = undefined
    if (!this.#lines.length || this.#mode === 'off') return true
    const text = this.#lines.join('')
    this.#lines = []
    try {
      if (this.#mode === 'fresh') {
        writeFileSync(this.path, JSON.stringify(header) + '\n' + text)
        this.#mode = 'append'
      } else {
        appendFileSync(this.path, (this.#cut ? '\n' : '') + text)
      }
      this.#cut = false
      return true
    } catch (error) {
      // part of it may be on disk: the next line starts on a line of its own
      this.#cut = this.#mode === 'append'
      this.onError(error)
      return false
    }
  }

  // The page's stats, read from the file a line at a time.
  async stats(period: StatsPeriod, now = Date.now()): Promise<PlayStats> {
    this.flushSync()
    const counter = new StatsCounter(period, now)
    if (this.#mode !== 'append') return counter.result()
    try {
      for await (const line of readLines(this.path)) {
        let raw: unknown
        try {
          raw = JSON.parse(line)
        } catch {
          // a line cut off by a crash
          continue
        }
        const l = parseLogLine(raw)
        if (l) counter.line(l)
      }
    } catch (error) {
      console.error(`Could not read ${this.path}`, error)
    }
    return counter.result()
  }
}

async function* readLines(path: string): AsyncGenerator<string> {
  const input = createReadStream(path, { encoding: 'utf8' })
  const lines = createInterface({ input, crlfDelay: Infinity })
  try {
    for await (const line of lines) if (line) yield line
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  } finally {
    lines.close()
    input.destroy()
  }
}
