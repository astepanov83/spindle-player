// Who is who (ticket 069): artists.json keeps artists, each with the tags
// that belong to it and who linked each one, you or the AI. One file for the
// user's renames and splits (ticket 024) and the AI's groups (ticket 068).
// Tags match by artistKey, so tags and library.json never change. The AI's
// progress is in a cache file of its own (artist-ai-cache.json).
import { artistKey, namesOf, tagOf } from './artists'
import { cleanNames, isKey, maxNameLength, maxNames, type ArtistChanges } from './artist-edit'
import type { Album, ArtistCredit, Track } from '../../library'

// The AI task's id on the AI service, for AiClient and the plugin list.
export const artistGroupsTask = 'artist-groups'

export type By = 'you' | 'ai'

export interface ArtistLink {
  // as written in the music files
  tag: string
  by: By
}

export interface ArtistEntry {
  name: string
  // who chose how the name is written
  nameBy: By
  tags: ArtistLink[]
}

export interface ArtistsFile {
  // a split shows its names in this order
  artists: ArtistEntry[]
}

// What a tag shows: one name (a rename or a group) or several (a split).
// byAi: the AI's links made it, none of yours.
export interface Shown {
  names: string[]
  byAi: boolean
}

export interface ArtistAiCache {
  // the prompt number the keys were asked with; another number means ask again
  prompt: number
  // tag keys already sent to the model for the split step and for the join
  // step, so a stopped job goes on from there
  split: Set<string>
  joined: Set<string>
}

// The tag as written for a key, or undefined when no album or song has it.
export type Spelling = (key: string) => string | undefined

const version = 1

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isBy = (v: unknown): v is By => v === 'you' || v === 'ai'

// Trimmed; undefined when nothing is left.
function cleanName(name: unknown): string | undefined {
  if (typeof name !== 'string') return undefined
  const n = name.trim().slice(0, maxNameLength)
  return artistKey(n) ? n : undefined
}

const keyOf = (l: ArtistLink): string => artistKey(l.tag)

export const noArtists = (): ArtistsFile => ({ artists: [] })
// A file with no prompt number is from the first prompt.
export const noCache = (prompt = 1): ArtistAiCache => ({
  prompt,
  split: new Set(),
  joined: new Set()
})

// A file this build can read.
export const knownArtists = (raw: unknown): boolean =>
  isObject(raw) && raw.version === version && Array.isArray(raw.artists)

export const knownCache = (raw: unknown): boolean =>
  isObject(raw) &&
  raw.version === version &&
  (Array.isArray(raw.joined) || Array.isArray(raw.split) || Array.isArray(raw.asked))

// Adds a link, one per tag key: a second one by you makes it yours.
function addLink(a: ArtistEntry, tag: string, by: By): void {
  const key = artistKey(tag)
  const old = a.tags.find((l) => keyOf(l) === key)
  if (!old) a.tags.push({ tag, by })
  else if (by === 'you') old.by = 'you'
}

const byName = (f: ArtistsFile, key: string): ArtistEntry | undefined =>
  f.artists.find((a) => artistKey(a.name) === key)

const dropEmpty = (f: ArtistsFile): void => {
  f.artists = f.artists.filter((a) => a.tags.length)
}

// A hand-made file is checked too: bad entries dropped, one artist per name
// key (their tags joined), one link per tag key in an artist, a few artists
// per tag at most, and artists with no links left dropped.
export function parseArtists(raw: unknown): ArtistsFile {
  const out = noArtists()
  if (!knownArtists(raw)) return out
  for (const v of (raw as { artists: unknown[] }).artists) {
    if (!isObject(v) || !Array.isArray(v.tags)) continue
    const name = cleanName(v.name)
    const nameBy = isBy(v.nameBy) ? v.nameBy : undefined
    if (!name || !nameBy) continue
    let a = byName(out, artistKey(name))
    if (!a) out.artists.push((a = { name, nameBy, tags: [] }))
    else if (a.nameBy === 'ai' && nameBy === 'you') {
      a.name = name
      a.nameBy = 'you'
    }
    for (const l of v.tags) {
      if (!isObject(l) || !isBy(l.by)) continue
      const tag = cleanName(l.tag)
      if (tag) addLink(a, tag, l.by)
    }
  }
  const count = new Map<string, number>()
  for (const a of out.artists)
    a.tags = a.tags.filter((l) => {
      const n = (count.get(keyOf(l)) ?? 0) + 1
      count.set(keyOf(l), n)
      return n <= maxNames
    })
  dropEmpty(out)
  return out
}

// What is written: a copy, so the file can change while a save waits.
export interface ArtistsData {
  version: number
  artists: ArtistEntry[]
}

export function serializeArtists(f: ArtistsFile): ArtistsData {
  return {
    version,
    artists: f.artists.map((a) => ({
      name: a.name,
      nameBy: a.nameBy,
      tags: a.tags.map((l) => ({ tag: l.tag, by: l.by }))
    }))
  }
}

// The text of artists.json, made to be read and edited by a person: one
// artist per line group, a lone tag on the artist's line, several tags one
// per line. Built by hand, as JSON.stringify can't keep a short list on a line.
export function artistsText(data: ArtistsData): string {
  const str = JSON.stringify
  const link = (l: ArtistLink): string => `{ "tag": ${str(l.tag)}, "by": ${str(l.by)} }`
  const entry = (a: ArtistEntry): string => {
    const head = `  { "name": ${str(a.name)}, "nameBy": ${str(a.nameBy)}, "tags": [`
    if (a.tags.length < 2)
      return `${head} ${a.tags.map(link).join('')}${a.tags.length ? ' ' : ''}] }`
    return `${head}\n${a.tags.map((l) => `    ${link(l)}`).join(',\n')} ] }`
  }
  const open = `{ "version": ${str(data.version)}, "artists": [`
  if (!data.artists.length) return `${open} ] }\n`
  return `${open}\n${data.artists.map(entry).join(',\n')}\n] }\n`
}

// A cache made with another prompt number loads empty: every name is asked
// again. An old file's `asked` is what `joined` is now.
export function parseCache(raw: unknown, prompt: number): ArtistAiCache {
  const out = noCache(prompt)
  if (!knownCache(raw)) return out
  const r = raw as Record<string, unknown>
  if ((typeof r.prompt === 'number' ? r.prompt : 1) !== prompt) return out
  const keys = (v: unknown, into: Set<string>): void => {
    if (Array.isArray(v)) for (const k of v) if (typeof k === 'string' && isKey(k)) into.add(k)
  }
  keys(r.split, out.split)
  keys(r.joined ?? r.asked, out.joined)
  return out
}

export function serializeCache(c: ArtistAiCache): unknown {
  return { version, prompt: c.prompt, split: [...c.split], joined: [...c.joined] }
}

// tag key -> what it shows; a tag not in the map shows as written. Yours
// wins: a tag with any link by you ignores its AI links, and AI links count
// only while the task is on. A tag that is its own name by you ("Use tag")
// shows as written, every spelling of it.
export function resolve(f: ArtistsFile, aiOn: boolean): Map<string, Shown> {
  const yours = new Map<string, { names: string[]; self: boolean }>()
  const ai = new Map<string, string[]>()
  for (const a of f.artists)
    for (const l of a.tags) {
      const key = keyOf(l)
      if (l.by === 'you') {
        const e = yours.get(key)
        if (e) e.names.push(a.name)
        else yours.set(key, { names: [a.name], self: a.name === l.tag })
      } else if (aiOn) {
        const names = ai.get(key)
        if (names) names.push(a.name)
        else ai.set(key, [a.name])
      }
    }
  const out = new Map<string, Shown>()
  for (const [key, { names, self }] of yours)
    if (!(self && names.length === 1)) out.set(key, { names, byAi: false })
  for (const [key, names] of ai) if (!yours.has(key)) out.set(key, { names, byAi: true })
  return out
}

// What an artist tag is shown as. An AI link to the tag's own spelling (the
// AI named an artist after one of its tags) shows plain, as no change.
export function creditOf(tag: string, shown: Map<string, Shown>): ArtistCredit {
  const s = shown.size ? shown.get(artistKey(tag)) : undefined
  if (!s || (s.names.length === 1 && s.names[0] === tag)) return { artist: tag }
  const c: ArtistCredit = { artist: s.names.join(', '), artistTag: tag }
  if (s.names.length > 1) c.artists = s.names
  if (s.byAi) c.grouped = true
  return c
}

// The keys of tags with a link by you: the AI job leaves them out and asks
// about the names you gave instead.
export function yourKeys(f: ArtistsFile): Set<string> {
  const out = new Set<string>()
  for (const a of f.artists) for (const l of a.tags) if (l.by === 'you') out.add(keyOf(l))
  return out
}

// The keys of tags with a link by the AI, to count what a run grouped.
export function aiKeys(f: ArtistsFile): Set<string> {
  const out = new Set<string>()
  for (const a of f.artists) for (const l of a.tags) if (l.by === 'ai') out.add(keyOf(l))
  return out
}

// The keys the files may keep: every artist tag in the library, and the
// names you gave, since the AI job asks about those too (a tag can join
// them). For prune and pruneCache.
export function usedKeys(credits: Iterable<ArtistCredit>): Set<string> {
  const out = new Set<string>()
  for (const c of credits) {
    out.add(artistKey(tagOf(c)))
    if (c.artistTag !== undefined && !c.grouped) for (const n of namesOf(c)) out.add(artistKey(n))
  }
  return out
}

// Each tag key's spelling, the first one seen in the order the Artists view
// reads them, so it matches the tag names the page shows and sends.
export function tagSpellings(
  albums: Album[],
  track: (id: string) => Track | undefined
): Map<string, string> {
  const out = new Map<string, string>()
  const add = (c: ArtistCredit): void => {
    const tag = tagOf(c)
    const key = artistKey(tag)
    if (key && !out.has(key)) out.set(key, tag)
  }
  for (const al of albums) {
    add(al)
    for (const id of al.trackIds) {
      const t = track(id)
      if (t) add(t)
    }
  }
  return out
}

// Removes a tag's links, all of them or only the AI's.
function unlink(f: ArtistsFile, key: string, onlyAi = false): void {
  for (const a of f.artists)
    a.tags = a.tags.filter((l) => keyOf(l) !== key || (onlyAi && l.by === 'you'))
}

const hasYours = (f: ArtistsFile, key: string): boolean =>
  f.artists.some((a) => a.tags.some((l) => l.by === 'you' && keyOf(l) === key))

// Links a tag by you to the artists with these names, made where needed. A
// new artist goes next to the one named before it, so a split keeps the
// order it was typed in where it can. rename: the names were just typed, so
// their spelling wins over the one saved.
function linkYours(f: ArtistsFile, tag: string, names: string[], rename: boolean): void {
  let prev: ArtistEntry | undefined
  names.forEach((name, i) => {
    let a = byName(f, artistKey(name))
    if (a) {
      if (rename) {
        a.name = name
        a.nameBy = 'you'
      }
    } else {
      a = { name, nameBy: 'you', tags: [] }
      const next = names
        .slice(i + 1)
        .map((n) => byName(f, artistKey(n)))
        .find((x) => x !== undefined)
      const at = prev ? f.artists.indexOf(prev) + 1 : next ? f.artists.indexOf(next) : -1
      if (at < 0) f.artists.push(a)
      else f.artists.splice(at, 0, a)
    }
    addLink(a, tag, 'you')
    prev = a
  })
}

const snapshot = (f: ArtistsFile): string => JSON.stringify(f.artists)

// The page's changes (Edit artist, "Use tag") as links by you. Each tag gets
// its names, and its old links go, the AI's too. null: the tag as its own
// name, so the AI leaves it alone. Names are what the user typed, so their
// spelling wins over the saved one (one artist per name key, so a tag pinned
// with "Use tag" follows a new spelling of its name). True when something changed.
export function applyChanges(f: ArtistsFile, c: ArtistChanges, spelling: Spelling): boolean {
  const before = snapshot(f)
  for (const [key, names] of Object.entries(c)) {
    if (!isKey(key)) continue
    const tag = spelling(key) ?? key
    unlink(f, key)
    // an artist left with no links must not lend its spelling to the new ones
    dropEmpty(f)
    const own = names === null || (names.length === 1 && names[0] === tag)
    linkYours(f, tag, own ? [tag] : cleanNames(names), true)
  }
  dropEmpty(f)
  return snapshot(f) !== before
}

// The keys of tags the AI split: AI links in two or more artists.
function splitKeys(f: ArtistsFile): Set<string> {
  const count = new Map<string, number>()
  for (const a of f.artists)
    for (const k of new Set(a.tags.filter((l) => l.by === 'ai').map(keyOf)))
      count.set(k, (count.get(k) ?? 0) + 1)
  return new Set([...count].filter(([, n]) => n > 1).map(([k]) => k))
}

// Links a tag by "ai" to one artist per part, replacing the tag's old AI
// links. A part joins the artist that has its name key (yours keeps its
// name); else a new artist, named with the library's most common spelling of
// the key, or as the model wrote it. Skipped when the tag has a link by you.
// An artist the old links left empty is reused before it is dropped, so
// saving the same split twice changes nothing. True when something changed.
export function addAiSplit(
  f: ArtistsFile,
  key: string,
  parts: string[],
  spelling: Spelling,
  nameOf: (key: string) => string | undefined
): boolean {
  if (!isKey(key) || hasYours(f, key)) return false
  const named = new Map<string, string>()
  for (const p of parts) {
    const n = cleanName(p)
    if (n && !named.has(artistKey(n))) named.set(artistKey(n), n)
  }
  if (!named.size || named.size > maxNames) return false
  const before = snapshot(f)
  const tag = spelling(key) ?? key
  unlink(f, key, true)
  for (const [k, written] of named) {
    let a = byName(f, k)
    if (!a) f.artists.push((a = { name: nameOf(k) ?? written, nameBy: 'ai', tags: [] }))
    addLink(a, tag, 'ai')
  }
  dropEmpty(f)
  return snapshot(f) !== before
}

// Removes the AI links of these tags, then artists with no links left. For
// the end of a full check, on the tags no new answer confirmed. Links by you
// stay. True when something changed.
export function dropStale(f: ArtistsFile, keys: Iterable<string>): boolean {
  const before = snapshot(f)
  for (const k of keys) unlink(f, k, true)
  dropEmpty(f)
  return snapshot(f) !== before
}

// Saves a group the AI found: keys of names that are one artist, and the
// name for a new artist. Tags with a link by you are skipped. The rest are
// linked to an artist the group already touches (yours first, and your name
// stays), else to a new one. Other AI artists it touches join that one, so
// a name already shown doesn't change. True when something changed.
export function addAiGroup(
  f: ArtistsFile,
  keys: string[],
  name: string,
  spelling: Spelling
): boolean {
  const clean = cleanName(name)
  // a tag the AI split is not taken apart: its parts are what get grouped
  const split = splitKeys(f)
  const own = [...new Set(keys.filter((k) => isKey(k) && !split.has(k)))]
  if (!clean || !own.length) return false
  const before = snapshot(f)
  const yours = new Set(own.filter((k) => hasYours(f, k)))
  // a key can be an artist's name (one you typed), or a tag the AI linked
  const touched = new Set<ArtistEntry>()
  for (const k of own) {
    const a = byName(f, k)
    if (a) touched.add(a)
    if (!yours.has(k))
      for (const b of f.artists)
        if (b.tags.some((l) => l.by === 'ai' && keyOf(l) === k)) touched.add(b)
  }
  const list = [...touched]
  let target = list.find((a) => a.nameBy === 'you') ?? list[0] ?? byName(f, artistKey(clean))
  if (!target) f.artists.push((target = { name: clean, nameBy: 'ai', tags: [] }))
  for (const a of list) {
    if (a === target || a.nameBy === 'you') continue
    for (const l of a.tags)
      if (l.by === 'ai' && !split.has(keyOf(l)) && !hasYours(f, keyOf(l)))
        addLink(target, l.tag, 'ai')
    a.tags = a.tags.filter((l) => l.by === 'you' || split.has(keyOf(l)))
  }
  for (const k of own) {
    if (yours.has(k)) continue
    const tag = spelling(k)
    // only a name, no album or song has it as a tag
    if (tag === undefined && byName(f, k)) continue
    for (const a of f.artists)
      if (a !== target) a.tags = a.tags.filter((l) => l.by === 'you' || keyOf(l) !== k)
    addLink(target, tag ?? k, 'ai')
  }
  dropEmpty(f)
  return snapshot(f) !== before
}

// Drops links to tags no album or song has any more, then artists with no
// links left. Only after a scan that ran to the end: a folder that could not
// be read keeps its songs. True when something changed.
export function prune(f: ArtistsFile, used: Set<string>): boolean {
  const before = snapshot(f)
  for (const a of f.artists) a.tags = a.tags.filter((l) => used.has(keyOf(l)))
  dropEmpty(f)
  return snapshot(f) !== before
}

// Marks keys as sent to the model (c.split or c.joined). True when
// something changed.
export function addAsked(c: Set<string>, keys: Iterable<string>): boolean {
  const before = c.size
  for (const k of keys) if (isKey(k)) c.add(k)
  return c.size !== before
}

// As prune, for both sets of the cache.
export function pruneCache(c: ArtistAiCache, used: Set<string>): boolean {
  const before = c.split.size + c.joined.size
  for (const set of [c.split, c.joined]) for (const k of set) if (!used.has(k)) set.delete(k)
  return c.split.size + c.joined.size !== before
}

// --- the old files, read once to move them (see convertOld) ---

// artist-overrides.json (024): tag key -> the names to show
export type OldOverrides = Map<string, string[]>
// artist-groups.json (068): tag key -> the name to show, and the keys asked
export interface OldGroups {
  groups: Map<string, string>
  asked: Set<string>
}

const knownOldOverrides = (raw: unknown): boolean =>
  isObject(raw) && raw.version === version && isObject(raw.artists)

const knownOldGroups = (raw: unknown): boolean =>
  isObject(raw) && raw.version === version && isObject(raw.groups) && Array.isArray(raw.asked)

export function parseOldOverrides(raw: unknown): OldOverrides {
  const out: OldOverrides = new Map()
  if (!knownOldOverrides(raw)) return out
  for (const [k, v] of Object.entries((raw as { artists: Record<string, unknown> }).artists)) {
    const names = cleanNames(v)
    if (isKey(k) && names.length) out.set(k, names)
  }
  return out
}

export function parseOldGroups(raw: unknown): OldGroups {
  const out: OldGroups = { groups: new Map(), asked: new Set() }
  if (!knownOldGroups(raw)) return out
  const { groups, asked } = raw as { groups: Record<string, unknown>; asked: unknown[] }
  for (const [k, v] of Object.entries(groups)) {
    const name = cleanName(v)
    if (isKey(k) && name) out.groups.set(k, name)
  }
  for (const k of asked) if (typeof k === 'string' && isKey(k)) out.asked.add(k)
  return out
}

// The one-time move from artist-overrides.json (024) and artist-groups.json
// (068). An override is a link by you (one that is the tag's own name, as
// "Use tag" saved it, stays one); a group is a link by the AI unless the tag
// has an override, as an override always won. A key no album or song has
// keeps the key as its tag: it still matches.
export function convertOld(
  overrides: OldOverrides,
  groups: OldGroups,
  spelling: Spelling
): { artists: ArtistsFile; cache: ArtistAiCache } {
  const f = noArtists()
  for (const [key, names] of overrides) {
    if (!isKey(key)) continue
    const tag = spelling(key) ?? key
    linkYours(f, tag, cleanNames(names), false)
  }
  for (const [key, name] of groups.groups) {
    const clean = cleanName(name)
    if (!isKey(key) || !clean || overrides.has(key)) continue
    // an override's name the task asked about, not a tag
    if (spelling(key) === undefined && byName(f, key)) continue
    let a = byName(f, artistKey(clean))
    if (!a) f.artists.push((a = { name: clean, nameBy: 'ai', tags: [] }))
    addLink(a, spelling(key) ?? key, 'ai')
  }
  dropEmpty(f)
  const cache = noCache()
  addAsked(cache.joined, groups.asked)
  return { artists: f, cache }
}
