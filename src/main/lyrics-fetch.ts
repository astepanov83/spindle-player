// Song words from LRCLIB (ticket 121), asked after the song's own files have
// none: one request for the song that starts, never ahead and never in a
// scan. What came back is kept in userData/fetched-lyrics/, so a song is
// asked once; "not found" is asked again after 30 days, as covers are.
// Nothing is sent while the setting is off: `on` is read before each request.
import { createHash } from 'crypto'
import { mkdir, readFile, rm } from 'fs/promises'
import { join } from 'path'
import { cleanAlbum, cleanArtist, stripEdition } from '../shared/clean-names'
import { maxLrcBytes, parseLyricsText, type Lyrics, type LyricsSong } from '../shared/lyrics'
import { writeFileAtomic } from './json-file'
import type { LyricsAsk } from './lyrics'
import { readCapped } from './read-capped'

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export interface LyricsFetchDeps {
  // userData/fetched-lyrics
  dir: string
  // the setting, read right before a request goes out
  on: () => boolean
  fetch: FetchLike
  userAgent: string
  now?: () => number
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
  log?: (text: string) => void
}

const api = 'https://lrclib.net/api/get'
// a miss is asked again after this long
export const noneMs = 30 * 24 * 3600 * 1000
// two requests are at least this far apart; skipping songs quickly sends none
// for the ones skipped, as they are dropped while they wait
export const gapMs = 1000
const firstBackOff = 60_000
const maxBackOff = 3_600_000
const timeoutMs = 10_000
// both kinds of words and some fields; a real answer is a few KB
const maxJson = 1024 * 1024
// LRCLIB picks a version within 2 s; one further off than this is another recording
const maxOffSeconds = 5

// What is kept for a song, by the file's extension.
const kinds = ['lrc', 'txt', 'instrumental', 'none'] as const
type Kind = (typeof kinds)[number]

// Not asked for: no name to search by. The library shows this when a song
// has no artist tag.
const noArtist = new Set(['', 'unknown artist'])

function sleepFor(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    const t = setTimeout(done, ms)
    function done(): void {
      signal.removeEventListener('abort', stop)
      resolve()
    }
    function stop(): void {
      clearTimeout(t)
      reject(signal.reason)
    }
    signal.addEventListener('abort', stop, { once: true })
  })
}

// What is sent: the artist, and the title without "(Remastered 2009)" and the
// like, which LRCLIB's names don't have. No album: LRCLIB finds nothing when
// its album name differs from ours, and the length already picks the version.
export function lookupOf(song: LyricsSong): { artist: string; title: string } | undefined {
  const artist = song.artist.trim()
  const title = stripEdition(song.title).trim() || song.title.trim()
  if (noArtist.has(artist.toLowerCase()) || !title) return undefined
  return { artist, title }
}

export function lookupUrl(artist: string, title: string, duration: number): string {
  const q = new URLSearchParams({ artist_name: artist, track_name: title })
  if (duration > 0) q.set('duration', String(Math.round(duration)))
  return `${api}?${q}`
}

// The kept file's name: the names as compared and the length, so a fixed
// tag asks again, and the same song in two folders is asked once.
export function lyricsFileName(artist: string, title: string, duration: number): string {
  const key = `${cleanArtist(artist)}\0${cleanAlbum(title)}\0${Math.round(duration)}`
  return createHash('sha1').update(key).digest('hex')
}

// What LRCLIB's answer means for us. Undefined: it has nothing for this song.
export function readAnswer(
  raw: unknown,
  duration: number
): { kind: Exclude<Kind, 'none'>; text: string; lyrics: Lyrics } | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  if (
    duration > 0 &&
    typeof r.duration === 'number' &&
    Math.abs(r.duration - duration) > maxOffSeconds
  )
    return undefined
  if (r.instrumental === true)
    return { kind: 'instrumental', text: '', lyrics: { instrumental: true } }
  if (typeof r.syncedLyrics === 'string') {
    const lyrics = parseLyricsText(r.syncedLyrics)
    if (lyrics && 'synced' in lyrics) return { kind: 'lrc', text: r.syncedLyrics, lyrics }
  }
  if (typeof r.plainLyrics === 'string' && r.plainLyrics.trim()) {
    const lyrics = plainOf(r.plainLyrics)
    if (lyrics) return { kind: 'txt', text: r.plainLyrics, lyrics }
  }
  return undefined
}

// Plain words are never read as LRC, whatever their lines start with.
function plainOf(text: string): Lyrics | undefined {
  const plain = text.trim().slice(0, 100_000)
  return plain ? { plain } : undefined
}

export class LyricsFetch {
  readonly #d: Required<LyricsFetchDeps>
  // when the next request may go out
  #next = 0
  #backOff = 0
  // the request out now: the next one waits for it
  #out: Promise<unknown> = Promise.resolve()

  constructor(deps: LyricsFetchDeps) {
    this.#d = {
      now: () => Date.now(),
      sleep: sleepFor,
      log: () => {},
      ...deps
    }
  }

  // For LyricsService.add.
  readonly source = (ask: LyricsAsk, signal: AbortSignal): Promise<Lyrics | undefined> =>
    this.get(ask, signal)

  async get(ask: LyricsAsk, signal: AbortSignal): Promise<Lyrics | undefined> {
    const song = ask.song
    const look = song && lookupOf(song)
    if (!song || !look) return undefined
    const name = lyricsFileName(look.artist, look.title, song.duration)
    const kept = await this.#readKept(name)
    if (kept) return kept.lyrics
    if (!this.#d.on()) return undefined
    // one at a time: wait for the request out now, then for the gap
    for (;;) {
      const out = this.#out
      await out
      signal.throwIfAborted()
      // another song's request went out meanwhile
      if (out !== this.#out) continue
      const wait = this.#next - this.#d.now()
      if (wait <= 0) break
      // backing off: asked again the next time the song plays
      if (this.#backOff) return undefined
      await this.#d.sleep(wait, signal)
    }
    if (!this.#d.on()) return undefined
    this.#next = this.#d.now() + gapMs
    // Once sent, the answer is kept even if the song has changed meanwhile,
    // so the request is not wasted.
    const asking = this.#ask(name, lookupUrl(look.artist, look.title, song.duration), song)
    this.#out = asking.catch(() => undefined)
    const got = await asking
    return signal.aborted ? undefined : got
  }

  async #ask(name: string, url: string, song: LyricsSong): Promise<Lyrics | undefined> {
    let res: Response
    try {
      res = await this.#d.fetch(url, {
        headers: { 'User-Agent': this.#d.userAgent },
        signal: AbortSignal.timeout(timeoutMs)
      })
    } catch (e) {
      // offline or a timeout: nothing kept, asked again next time
      this.#d.log(`Lyrics lookup failed: ${e}`)
      return undefined
    }
    if (res.status === 429 || res.status === 503) {
      this.#backOff = this.#backOff ? Math.min(maxBackOff, this.#backOff * 2) : firstBackOff
      this.#next = Math.max(this.#next, this.#d.now() + this.#backOff)
      this.#d.log(`Lyrics lookup: LRCLIB is busy (${res.status}), waiting ${this.#backOff / 1000}s`)
      return undefined
    }
    this.#backOff = 0
    if (res.status === 404) {
      await this.#keep(name, 'none', String(this.#d.now()))
      return undefined
    }
    if (!res.ok) {
      this.#d.log(`Lyrics lookup: LRCLIB answered ${res.status}`)
      return undefined
    }
    let raw: unknown
    try {
      const bytes = await readCapped(res, maxJson)
      if (!bytes) throw new Error('too big')
      raw = JSON.parse(new TextDecoder().decode(bytes))
    } catch (e) {
      // a cut answer or a Wi-Fi sign-in page: not an answer
      this.#d.log(`Lyrics lookup: no answer read: ${e}`)
      return undefined
    }
    const got = readAnswer(raw, song.duration)
    if (!got) await this.#keep(name, 'none', String(this.#d.now()))
    else await this.#keep(name, got.kind, got.text)
    return got?.lyrics
  }

  // The kept answer: words, or a miss still fresh. Undefined: ask.
  async #readKept(name: string): Promise<{ lyrics: Lyrics | undefined } | undefined> {
    for (const kind of kinds) {
      let text: string
      try {
        const bytes = await readFile(join(this.#d.dir, `${name}.${kind}`))
        if (bytes.length > maxLrcBytes) continue
        text = bytes.toString('utf8')
      } catch {
        continue
      }
      switch (kind) {
        case 'lrc':
        case 'txt': {
          const lyrics = kind === 'lrc' ? parseLyricsText(text) : plainOf(text)
          if (lyrics) return { lyrics }
          continue
        }
        case 'instrumental':
          return { lyrics: { instrumental: true } }
        case 'none': {
          const at = Number(text.trim())
          const now = this.#d.now()
          // a time ahead of now: the clock was wrong, ask again
          if (Number.isFinite(at) && at <= now && now - at < noneMs) return { lyrics: undefined }
          return undefined
        }
      }
    }
    return undefined
  }

  // One file per song: the new one is written first, then the others go.
  async #keep(name: string, kind: Kind, text: string): Promise<void> {
    try {
      await mkdir(this.#d.dir, { recursive: true })
      await writeFileAtomic(join(this.#d.dir, `${name}.${kind}`), text)
      for (const k of kinds)
        if (k !== kind) await rm(join(this.#d.dir, `${name}.${k}`), { force: true })
    } catch (e) {
      this.#d.log(`Lyrics not kept: ${e}`)
    }
  }
}
