// The cover of the song playing on the radio (ticket 032). Main hears each
// title, asks the library process to look the song up (it holds the online
// cover lookup and its limiters), and makes the picture into the cover cache
// with its colors through the cover window, as for a station logo (030). The
// page never sends a title anywhere; it gets the cover with radio:cover.
//
// Follows "Find missing covers online": off, nothing is looked up. Results are
// kept by artist and song in radio-covers.json, misses too, so a song or a
// jingle played again is not looked up again.
import { parseThemePalettes } from '../../shared/palette'
import type { RadioCover } from '../../shared/ipc'
import { songQuery, type SongQuery } from '../../shared/radio-title'
import type { SongCover } from '../../shared/stations'
import { JsonFileWriter, readJsonFile, removeStrayTmp } from '../json-file'
import { cleanArtist } from '../library/cover-match'
import { isCoverHash } from '../library/cover-names'
import { cleanSong, type SongSource } from '../library/song-cover'
import { makeCover, withNewColors, type LogoCache } from './logos'

const sources = ['deezer', 'itunes'] as const

// a miss is looked up again after this long, as for albums
export const notFoundMs = 30 * 24 * 3600 * 1000

// The library process's answer: the picture as downloaded, not found, or
// "later" (a service failed, the lookup was stopped, the setting is off).
export type FindSong = (q: SongQuery, signal: AbortSignal) => Promise<Uint8Array | 'none' | 'later'>

// A found cover keeps the paletteVersion its colors were picked with; no
// cover means not found.
export interface SongCoverEntry {
  cover?: SongCover & { v?: number }
  at: number
}

// songKey -> result
export type SongCoverMap = Map<string, SongCoverEntry>

// Songs are the same after cleanup: "IRON MAIDEN - The Trooper (1998 Remaster)"
// is "Iron Maiden - The Trooper".
export const songKey = (q: SongQuery): string => cleanArtist(q.artist) + '\0' + cleanSong(q.song)

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function parseCover(raw: unknown): SongCoverEntry['cover'] {
  if (!isObject(raw) || typeof raw.hash !== 'string' || !isCoverHash(raw.hash)) return undefined
  const palette = parseThemePalettes(raw.palette)
  if (!palette) return undefined
  const c: SongCoverEntry['cover'] = { hash: raw.hash, palette }
  if (raw.small === true) c.small = true
  if (typeof raw.v === 'number' && Number.isInteger(raw.v) && raw.v > 0) c.v = raw.v
  return c
}

// A cache: anything it can't read is dropped and looked up again.
export function parseSongCovers(raw: unknown): SongCoverMap {
  const out: SongCoverMap = new Map()
  if (!isObject(raw) || raw.version !== 1 || !isObject(raw.songs)) return out
  for (const [key, v] of Object.entries(raw.songs)) {
    if (!isObject(v) || typeof v.at !== 'number' || !Number.isFinite(v.at)) continue
    if (v.cover === undefined) {
      out.set(key, { at: v.at })
      continue
    }
    const cover = parseCover(v.cover)
    if (cover) out.set(key, { cover, at: v.at })
  }
  return out
}

export function serializeSongCovers(map: SongCoverMap): unknown {
  return { version: 1, songs: Object.fromEntries(map) }
}

// At start: found covers are kept while their song is in some station's
// recent songs (the rows show them), so the files in the cover cache stay
// as few as the history; misses are kept 30 days. True when it dropped any.
export function pruneSongCovers(map: SongCoverMap, titles: string[], now: number): boolean {
  const heard = new Set<string>()
  for (const t of titles) {
    const q = songQuery(t)
    if (q) heard.add(songKey(q))
  }
  let dropped = false
  for (const [key, e] of map)
    if (e.cover ? !heard.has(key) : now - e.at >= notFoundMs) {
      map.delete(key)
      dropped = true
    }
  return dropped
}

// The covers in the map, for the prune before SongCovers is made.
export function foundHashes(map: SongCoverMap): string[] {
  return [...new Set([...map.values()].flatMap((e) => (e.cover ? [e.cover.hash] : [])))]
}

// radio-covers.json in userData. A cache, like fetched-covers.json: a broken
// file starts empty and is written again; one that can't be read is left alone.
export function openSongCovers(
  path: string,
  titles: string[],
  now: number,
  log: (text: string) => void
): { map: SongCoverMap; save(): void; flushSync(): void } {
  removeStrayTmp(path)
  const r = readJsonFile(path)
  if (r.kind === 'broken' || r.kind === 'unreadable') log(`Song covers file is ${r.kind}: ${path}`)
  const map = parseSongCovers(r.kind === 'ok' ? r.value : undefined)
  const writer =
    r.kind === 'unreadable'
      ? undefined
      : new JsonFileWriter<unknown>(path, 1000, (e) => log(`Could not save ${path}: ${e}`), 0)
  const save = (): void => writer?.schedule(serializeSongCovers(map))
  if (pruneSongCovers(map, titles, now)) save()
  return { map, save, flushSync: () => writer?.flushSync() }
}

export interface SongCoverSetting {
  on: boolean
  sources: Record<SongSource, boolean>
}

export interface SongCoversDeps {
  // "Find missing covers online" as it is now
  setting(): SongCoverSetting
  find: FindSong
  cache: LogoCache
  map: SongCoverMap
  // the map changed
  save(): void
  // hashes() grew: the cover prune must hear of it before the files are written
  kept(): void
  send(c: RadioCover): void
  log(text: string): void
  now(): number
}

const toPage = (c: NonNullable<SongCoverEntry['cover']>): SongCover => {
  const out: SongCover = { hash: c.hash, palette: c.palette }
  if (c.small) out.small = true
  return out
}

export class SongCovers {
  // the newest title of the stream playing; only its cover is sent
  #current: { stationId: string; title: string; station: string } | undefined
  // lookups running, by song key
  #lookups = new Map<string, { stop: AbortController; job: Promise<SongCover | undefined> }>()
  // covers made this run, kept even when their result was not stored
  #made = new Set<string>()
  #setting: SongCoverSetting

  constructor(readonly d: SongCoversDeps) {
    this.#setting = d.setting()
  }

  // A new title in the stream playing. A lookup for another title stops: its
  // answer would be dropped.
  heard(stationId: string, title: string, station: string): void {
    this.#current = { stationId, title, station }
    const q = songQuery(title, station)
    const key = q && songKey(q)
    for (const [k, l] of this.#lookups) if (k !== key) l.stop.abort()
    if (q && key) void this.#show(stationId, title, q, key)
  }

  // Radio stopped (radio:stop): the title is no longer playing, so a later
  // setting change looks nothing up and a lookup running now is dropped.
  stopped(): void {
    this.#current = undefined
    this.#stopAll()
  }

  // The setting changed. Off: lookups stop. A service turned off: lookups
  // stop (the library process stops them too, since they may be about to ask
  // it) and the title playing is looked up again with the others. On, or a
  // service turned on: misses are looked up again, and so is the title playing.
  settingChanged(): void {
    const before = this.#setting
    const now = this.d.setting()
    this.#setting = now
    if (!now.on) return this.#stopAll()
    const removed = sources.some((s) => before.sources[s] && !now.sources[s])
    if (removed) this.#stopAll()
    const added = sources.some((s) => now.sources[s] && !before.sources[s])
    if (added) {
      let dropped = false
      for (const [key, e] of this.d.map)
        if (!e.cover) {
          this.d.map.delete(key)
          dropped = true
        }
      if (dropped) this.d.save()
    }
    const c = this.#current
    if (c && (added || removed || !before.on)) this.heard(c.stationId, c.title, c.station)
  }

  #stopAll(): void {
    for (const l of this.#lookups.values()) l.stop.abort()
  }

  // The cover found for a title, for the recent songs; no request.
  known(title: string): SongCover | undefined {
    const q = songQuery(title)
    const c = q && this.d.map.get(songKey(q))?.cover
    return c && toPage(c)
  }

  // Covers the prune must keep.
  hashes(): string[] {
    return [...new Set([...this.#made, ...foundHashes(this.d.map)])]
  }

  async #show(stationId: string, title: string, q: SongQuery, key: string): Promise<void> {
    const cover = await this.#coverFor(q, key)
    const c = this.#current
    if (!cover || c?.stationId !== stationId || c.title !== title) return
    this.d.send({ stationId, title, cover })
  }

  async #coverFor(q: SongQuery, key: string): Promise<SongCover | undefined> {
    const had = this.d.map.get(key)
    if (had?.cover) {
      if (await this.d.cache.hasLogo(had.cover.hash, !had.cover.small))
        return this.#withNewColors(key, had.cover)
      // its files are gone from the cache: looked up again
    } else if (had && this.d.now() - had.at < notFoundMs) return undefined
    // read now: the setting can change while radio plays
    const { on, sources } = this.d.setting()
    if (!on || (!sources.deezer && !sources.itunes)) return undefined
    // a stopped one may still answer (its cancel was lost) but is not waited on
    const running = this.#lookups.get(key)
    if (running && !running.stop.signal.aborted) return running.job
    const stop = new AbortController()
    const job = this.#lookUp(q, key, stop.signal).finally(() => {
      if (this.#lookups.get(key)?.stop === stop) this.#lookups.delete(key)
    })
    this.#lookups.set(key, { stop, job })
    return job
  }

  async #lookUp(q: SongQuery, key: string, signal: AbortSignal): Promise<SongCover | undefined> {
    let found: Uint8Array | 'none' | 'later'
    try {
      found = await this.d.find(q, signal)
    } catch (e) {
      this.d.log(`Could not look up a song cover: ${String(e)}`)
      return undefined
    }
    if (found === 'later') return undefined
    if (found === 'none') {
      this.d.map.set(key, { at: this.d.now() })
      this.d.save()
      return undefined
    }
    const cover = await makeCover(this.d.cache, found, (h) => {
      if (this.#made.has(h)) return
      this.#made.add(h)
      this.d.kept()
    })
    // tried again the next time the song plays
    if (!cover) {
      this.d.log(`Could not make a song cover for ${q.artist} - ${q.song}`)
      return undefined
    }
    this.d.map.set(key, { cover, at: this.d.now() })
    this.d.save()
    return toPage(cover)
  }

  // New colors, kept in the file, for ones an older paletteVersion picked.
  async #withNewColors(key: string, c: NonNullable<SongCoverEntry['cover']>): Promise<SongCover> {
    const next = await withNewColors(this.d.cache, c)
    if (!next || next === c) return toPage(c)
    const e = this.d.map.get(key)
    if (e) {
      this.d.map.set(key, { ...e, cover: next })
      this.d.save()
    }
    return toPage(next)
  }
}
