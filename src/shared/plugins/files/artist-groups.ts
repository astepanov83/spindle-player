// Spellings of one artist grouped by a language model (ticket 068): "Bjork"
// and "Björk" shown as one. Kept by artistKey of the tag in
// artist-groups.json, so tags and library.json never change. The library
// process applies them while the task is on; a manual override always wins
// (see creditOf in artist-overrides.ts).
import { artistKey, namesOf, tagOf } from './artists'
import { isKey, maxNameLength } from './artist-overrides'
import type { ArtistCredit } from '../../library'

// The task's id on the AI service, for AiClient and the plugin list.
export const artistGroupsTask = 'artist-groups'

// tag key -> the name to show
export type GroupNames = Map<string, string>

export interface ArtistGroups {
  groups: GroupNames
  // tag keys already sent to the model, so a stopped job goes on from there
  asked: Set<string>
}

const version = 1

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export const noGroups = (): ArtistGroups => ({ groups: new Map(), asked: new Set() })

// Trimmed; undefined when nothing is left.
function cleanName(name: unknown): string | undefined {
  if (typeof name !== 'string') return undefined
  const n = name.trim().slice(0, maxNameLength)
  return artistKey(n) ? n : undefined
}

// A file this build can read.
export const knownGroups = (raw: unknown): boolean =>
  isObject(raw) && raw.version === version && isObject(raw.groups) && Array.isArray(raw.asked)

export function parseGroups(raw: unknown): ArtistGroups {
  const out = noGroups()
  if (!knownGroups(raw)) return out
  const { groups, asked } = raw as { groups: Record<string, unknown>; asked: unknown[] }
  for (const [k, v] of Object.entries(groups)) {
    const name = cleanName(v)
    if (isKey(k) && name) out.groups.set(k, name)
  }
  for (const k of asked) if (typeof k === 'string' && isKey(k)) out.asked.add(k)
  return out
}

export function serializeGroups(g: ArtistGroups): unknown {
  return { version, groups: Object.fromEntries(g.groups), asked: [...g.asked] }
}

// Saves a group found: keys of tags that are one artist, and the name to
// show. A group that shares a key with a saved one joins it and keeps the
// saved name, so a name already shown doesn't change. True when something changed.
export function addGroup(g: ArtistGroups, keys: string[], name: string): boolean {
  const clean = cleanName(name)
  const own = keys.filter(isKey)
  if (!clean || !own.length) return false
  const saved = own.map((k) => g.groups.get(k)).filter((n) => n !== undefined)
  const shown = saved[0] ?? clean
  let changed = false
  const set = (k: string): void => {
    if (g.groups.get(k) === shown) return
    g.groups.set(k, shown)
    changed = true
  }
  // every saved group it touches becomes one, under the first one's name
  const joined = new Set(saved.map(artistKey))
  if (joined.size) for (const [k, n] of g.groups) if (joined.has(artistKey(n))) set(k)
  for (const k of own) set(k)
  return changed
}

// Marks keys as sent to the model. True when something changed.
export function addAsked(g: ArtistGroups, keys: Iterable<string>): boolean {
  const before = g.asked.size
  for (const k of keys) if (isKey(k)) g.asked.add(k)
  return g.asked.size !== before
}

// Drops keys of tags no album or song has any more. Only after a scan that
// ran to the end: a folder that could not be read keeps its songs.
export function dropUnusedGroups(g: ArtistGroups, used: Set<string>): boolean {
  let changed = false
  for (const k of g.groups.keys())
    if (!used.has(k)) {
      g.groups.delete(k)
      changed = true
    }
  for (const k of g.asked)
    if (!used.has(k)) {
      g.asked.delete(k)
      changed = true
    }
  return changed
}

// The keys the file may keep: every artist tag in the library, and the names
// overrides give, since the task asks about those too (a tag can join them).
export function usedKeys(credits: Iterable<ArtistCredit>): Set<string> {
  const out = new Set<string>()
  for (const c of credits) {
    out.add(artistKey(tagOf(c)))
    if (c.artistTag !== undefined && !c.grouped) for (const n of namesOf(c)) out.add(artistKey(n))
  }
  return out
}
