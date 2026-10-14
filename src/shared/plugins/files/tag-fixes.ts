// Song info fixed inside Spindle (ticket 129): tag-fixes.json in userData,
// by item key, holds the fields of a song that differ from its file's tags.
// The library process applies them when it builds the library, so albums
// group by the fixed album and everything else sees the fixed values. Music
// files are never written.
import { genresOf } from '../../genres'
import type { TagValues } from '../../library'
import type { IdMoves } from '../../id-moves'
import { itemKey, splitKey, type ItemKey } from '../items'
import { isLooseId } from './loose'

export const tagFields = [
  'title',
  'artist',
  'album',
  'albumArtist',
  'year',
  'genre',
  'no',
  'disc'
] as const
export type TagField = (typeof tagFields)[number]

export type { TagValues }

// The fields of one song that differ from its file. An empty value takes the
// file's tag away ('' title: the file name is the title again).
export type TagFix = Partial<TagValues>

// by the files plugin's track id
export type TagFixes = ReadonlyMap<string, TagFix>

export interface TagFixesData {
  version: 1
  fixes: Record<ItemKey, TagFix>
}

// A song's tags now (with its fix) and in its file, for the edit form.
export interface SongTags {
  now: TagValues
  file: TagValues
}

// Changes from the page. `edit`: the fields typed into (`set`, the same for
// every song) and the fields put back to the file's own value (`reset`).
// `put`: each song's fix as given, null for none (Undo). `clear`: every fix
// goes (Undo all).
export type TagChange =
  | { edit: { ids: string[]; set: TagFix; reset: TagField[] } }
  | { put: Record<string, TagFix | null> }
  | { clear: true }

// What the songs a change touched had before it, null for no fix: a `put` of
// it is the change's Undo.
export type FixesBefore = Record<string, TagFix | null>

const textFields = new Set<TagField>(['title', 'artist', 'album', 'albumArtist'])

export const maxTextLength = 1000
// a year, a track or a disc number
export const maxNumber = 9999
export const maxGenres = 20
export const maxGenreLength = 200
// more songs than a library has: such a message is not taken
export const maxIds = 1_000_000

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const isField = (f: unknown): f is TagField =>
  typeof f === 'string' && (tagFields as readonly string[]).includes(f)

// A field's value cleaned up, or undefined when it can't be one.
function cleanValue(field: TagField, v: unknown): TagValues[TagField] | undefined {
  if (textFields.has(field)) {
    if (typeof v !== 'string') return undefined
    const s = v.trim()
    return s.length <= maxTextLength ? s : undefined
  }
  if (field === 'genre') {
    if (!Array.isArray(v) || v.length > maxGenres) return undefined
    if (!v.every((g) => typeof g === 'string' && g.length <= maxGenreLength)) return undefined
    return (v as string[]).map((g) => g.trim()).filter(Boolean)
  }
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) <= maxNumber
    ? (v as number)
    : undefined
}

// The known fields with good values; a bad field is dropped alone. None
// when nothing is left.
export function cleanFix(raw: unknown): TagFix | undefined {
  if (!isObject(raw)) return undefined
  const out: Record<string, unknown> = {}
  for (const f of tagFields) {
    if (!Object.hasOwn(raw, f)) continue
    const v = cleanValue(f, raw[f])
    if (v !== undefined) out[f] = v
  }
  return Object.keys(out).length ? (out as TagFix) : undefined
}

// Version 1 with a fixes object. Anything else is copied aside before the first save.
export function isKnownTagFixes(raw: unknown): boolean {
  return isObject(raw) && raw.version === 1 && isObject(raw.fixes)
}

// A bad entry is dropped on its own; a file of another shape gives none.
export function parseTagFixes(raw: unknown): Map<string, TagFix> {
  const out = new Map<string, TagFix>()
  if (!isObject(raw) || !isObject(raw.fixes)) return out
  for (const [key, value] of Object.entries(raw.fixes)) {
    const k = key.length <= 5000 ? splitKey(key) : undefined
    const fix = k?.plugin === 'files' && !isLooseId(k.id) ? cleanFix(value) : undefined
    if (k && fix) out.set(k.id, fix)
  }
  return out
}

export function tagFixesData(fixes: TagFixes): TagFixesData {
  const out: Record<ItemKey, TagFix> = {}
  for (const [id, fix] of fixes) out[itemKey('files', id)] = fix
  return { version: 1, fixes: out }
}

// Genres count as the library shows them: "Rock, Metal" is "Rock; Metal".
export function sameValue<F extends TagField>(f: F, a: TagValues[F], b: TagValues[F]): boolean {
  if (f !== 'genre') return a === b
  const x = genresOf(a as string[])
  const y = genresOf(b as string[])
  return x.length === y.length && x.every((g, i) => g === y[i])
}

// Only the fields that differ from the file's; none when no field does.
export function onlyDifferences(fix: TagFix, file: TagValues): TagFix | undefined {
  const out: Record<string, unknown> = {}
  for (const f of tagFields) {
    const v = fix[f]
    if (v !== undefined && !sameValue(f, v, file[f])) out[f] = v
  }
  return Object.keys(out).length ? (out as TagFix) : undefined
}

function sameFix(a: TagFix | undefined, b: TagFix | undefined): boolean {
  if (!a || !b) return a === b
  return tagFields.every((f) =>
    a[f] === undefined || b[f] === undefined ? a[f] === b[f] : sameValue(f, a[f], b[f])
  )
}

// Applies a change. `fileOf` gives a song's tags as its file has them, or
// none for a song not in the library: an edit passes over it. Undefined when
// nothing changed, else the new fixes and what the songs touched had before.
export function changeFixes(
  fixes: TagFixes,
  c: TagChange,
  fileOf: (id: string) => TagValues | undefined
): { fixes: Map<string, TagFix>; before: FixesBefore } | undefined {
  const out = new Map(fixes)
  const before: FixesBefore = {}
  const set = (id: string, fix: TagFix | undefined): void => {
    const was = out.get(id)
    if (sameFix(was, fix)) return
    if (!Object.hasOwn(before, id)) before[id] = was ?? null
    if (fix) out.set(id, fix)
    else out.delete(id)
  }
  if ('clear' in c) for (const id of fixes.keys()) set(id, undefined)
  else if ('put' in c)
    for (const [id, fix] of Object.entries(c.put)) {
      // a song opened from outside the library (ticket 124) is never changed
      if (isLooseId(id)) continue
      const file = fileOf(id)
      set(id, fix && file ? onlyDifferences(fix, file) : (fix ?? undefined))
    }
  else
    for (const id of c.edit.ids) {
      const file = isLooseId(id) ? undefined : fileOf(id)
      if (!file) continue
      const next: TagFix = { ...out.get(id), ...c.edit.set }
      for (const f of c.edit.reset) delete next[f]
      set(id, onlyDifferences(next, file))
    }
  return Object.keys(before).length ? { fixes: out, before } : undefined
}

// Track ids from the page, or undefined for a bad list.
export function parseIds(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw) || raw.length > maxIds) return undefined
  return raw.every((id) => typeof id === 'string' && id && id.length <= 5000)
    ? (raw as string[])
    : undefined
}

// A change from the page, checked; undefined for a bad one.
export function parseTagChange(raw: unknown): TagChange | undefined {
  if (!isObject(raw)) return undefined
  if (raw.clear === true) return { clear: true }
  if (isObject(raw.put)) {
    const put: Record<string, TagFix | null> = {}
    const entries = Object.entries(raw.put)
    if (entries.length > maxIds) return undefined
    for (const [id, fix] of entries) {
      if (!id || id.length > 5000) return undefined
      if (fix === null) put[id] = null
      else {
        const f = cleanFix(fix)
        if (!f) return undefined
        put[id] = f
      }
    }
    return { put }
  }
  const e = raw.edit
  const ids = isObject(e) ? parseIds(e.ids) : undefined
  if (!isObject(e) || !ids || !Array.isArray(e.reset)) return undefined
  if (!e.reset.every(isField) || !isObject(e.set)) return undefined
  const set = cleanFix(e.set) ?? {}
  // a field with a bad value makes the message bad: it is not saved in part
  if (Object.keys(e.set).some((f) => !isField(f) || !Object.hasOwn(set, f))) return undefined
  return { edit: { ids, set, reset: e.reset } }
}

// Songs whose ids changed (see id-moves.ts) keep their fixes. A song whose
// new id has a fix already keeps that one. The same map when nothing moved.
export function moveFixes(fixes: TagFixes, moves: IdMoves): TagFixes {
  const moved = (id: string): boolean => Object.hasOwn(moves, id)
  if (![...fixes.keys()].some(moved)) return fixes
  const out = new Map<string, TagFix>()
  for (const [id, fix] of fixes) if (!moved(id)) out.set(id, fix)
  for (const [id, fix] of fixes) if (moved(id) && !out.has(moves[id])) out.set(moves[id], fix)
  return out
}

// After a scan that ran to the end: fixes of songs no longer in the library
// go, and so do fields the file now has itself. The same map when nothing went.
export function pruneFixes(
  fixes: TagFixes,
  fileOf: (id: string) => TagValues | undefined
): TagFixes {
  let out: Map<string, TagFix> | undefined
  for (const [id, fix] of fixes) {
    const file = fileOf(id)
    const kept = file && onlyDifferences(fix, file)
    if (kept && sameFix(kept, fix)) continue
    out ??= new Map(fixes)
    if (kept) out.set(id, kept)
    else out.delete(id)
  }
  return out ?? fixes
}
