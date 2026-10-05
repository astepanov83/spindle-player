// The artist groups task's requests and answers (tickets 068, 070): which
// names go to the model, the text it gets for each step (split, then join),
// and what of its answers is kept. Plain functions,
// so they are tested without a model; the job that asks is group-artists-job.ts.
import type { Album, ArtistCredit, Track } from '../../../shared/library'
import type { JsonSchema } from '../../../shared/ai'
import { artistKey, namesOf, tagOf } from '../../../shared/plugins/files/artists'
import { lookUpArtist } from './artist-photo'
import { checksOf } from './group'
import { maxNameLength, maxNames } from '../../../shared/plugins/files/artist-edit'

// One name the task knows: a tag with no link by you, or a name you gave a
// tag (so a tag can join it).
export interface TaskName {
  // the line's number: its place in the sorted list, from 1
  n: number
  key: string
  // the spelling seen most often
  name: string
  // up to two album or song titles, albums first
  titles: string[]
  // how often `name` itself is credited, one per album and per song
  count: number
  // when `name` was first seen in library order, for a tie
  seen: number
  // you gave it (a link by you in artists.json)
  manual: boolean
}

// About quality, not size: small models get careless with thousands of names at once.
export const chunkSize = 200

// Raise it whenever a prompt changes: the cache then asks every name again.
export const promptNumber = 2

// Both prompts are short on purpose and name no artist, not even as an
// example (ticket 070): paid models need no hints, and a name in the prompt
// leaks into answers.
export const splitSystem = `You get artist tags from one person's music library. For each line under
CHECK, list the real artists the tag names, each written as in the tag.
Leave out lines that already name exactly one artist and nothing else.
If you are not sure, leave the line out. Answer only with JSON.`

export const joinSystem = `You get artist names from one person's music library. For each line under
CHECK, find a different line in LIST that is the same artist, if any.
Never answer a line with its own number. Leave out lines with no match.
If you are not sure, leave the line out. Answer only with JSON.`

// { "tags": [ { "check": 57, "artists": ["A", "B"], "why": "..." } ] }
export const splitSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['tags'],
  properties: {
    tags: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['check', 'artists', 'why'],
        properties: {
          check: { type: 'integer' },
          artists: { type: 'array', items: { type: 'string' } },
          why: { type: 'string' }
        }
      }
    }
  }
}

export const joinSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['matches'],
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['check', 'same', 'why'],
        properties: {
          check: { type: 'integer' },
          same: { type: 'integer' },
          why: { type: 'string' }
        }
      }
    }
  }
}

// Reasoning models used up 8000 on thinking and gave an empty answer.
export const maxOutput = 32000

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

// Every name the task knows, sorted and numbered. Names like "Various
// Artists" and "Unknown artist" match anyone, so they are left out. yours:
// keys of tags with a link by you (yourKeys), which give their names instead.
export function taskNames(
  albums: Album[],
  tracks: Track[],
  yours: Set<string> = new Set()
): TaskName[] {
  const byId = new Map(tracks.map((t) => [t.id, t]))
  const byKey = new Map<
    string,
    {
      spellings: Map<string, { n: number; seen: number }>
      manual: boolean
      own: Album[]
      also: Track[]
      songs: Track[]
    }
  >()
  // credits so far, so spellings of different keys can be told apart on a tie
  let seen = 0
  // the names a credit gives the task: the tag, or the names you gave it. A
  // tag you kept as it is ("Use tag") shows plain, so it is found by key.
  const namesFor = (c: ArtistCredit): { names: string[]; manual: boolean } =>
    (c.artistTag !== undefined && !c.grouped) || yours.has(artistKey(tagOf(c)))
      ? { names: namesOf(c), manual: true }
      : { names: [tagOf(c)], manual: false }
  const credit = (c: ArtistCredit): Set<string> => {
    const keys = new Set<string>()
    const { names, manual } = namesFor(c)
    seen++
    for (const name of names) {
      const key = artistKey(name)
      if (!key || keys.has(key)) continue
      keys.add(key)
      let e = byKey.get(key)
      if (!e) byKey.set(key, (e = { spellings: new Map(), manual, own: [], also: [], songs: [] }))
      const sp = e.spellings.get(name)
      if (sp) sp.n++
      else e.spellings.set(name, { n: 1, seen })
      e.manual ||= manual
    }
    return keys
  }
  for (const al of albums) {
    const owners = credit(al)
    for (const k of owners) byKey.get(k)!.own.push(al)
    for (const id of al.trackIds) {
      const t = byId.get(id)
      if (!t) continue
      for (const k of credit(t)) {
        const e = byKey.get(k)!
        if (owners.has(k)) e.songs.push(t)
        else e.also.push(t)
      }
    }
  }
  const out: TaskName[] = []
  for (const [key, e] of byKey) {
    let name = ''
    let best = { n: 0, seen: 0 }
    // the first one seen wins a tie, as in listArtists
    for (const [s, c] of e.spellings)
      if (c.n > best.n) {
        best = c
        name = s
      }
    if (!lookUpArtist(name)) continue
    const titles = checksOf(e.own, e.also, e.songs)
      .slice(0, 2)
      .map((c) => c.title)
    out.push({ n: 0, key, name, titles, count: best.n, seen: best.seen, manual: e.manual })
  }
  return numbered(out)
}

// Sorted by name and numbered from 1, in place.
function numbered(list: TaskName[]): TaskName[] {
  list.sort((x, y) => collator.compare(x.name, y.name) || (x.key < y.key ? -1 : 1))
  list.forEach((t, i) => (t.n = i + 1))
  return list
}

// The names step 2 (join) asks about: a tag the AI split leaves, and its
// parts come in with its titles, so a part can join another spelling. A
// part with the key of a name already there is that name. splits: tag key
// -> the names of the artists it is split into (aiSplits). Numbered anew.
export function joinNames(names: TaskName[], splits: Map<string, string[]>): TaskName[] {
  const split = (t: TaskName): boolean => !t.manual && splits.has(t.key)
  const out = names.filter((t) => !split(t)).map((t) => ({ ...t }))
  const keys = new Set(out.map((t) => t.key))
  for (const t of names.filter(split))
    for (const part of splits.get(t.key)!) {
      const key = artistKey(part)
      if (!key || keys.has(key) || !lookUpArtist(part)) continue
      keys.add(key)
      out.push({ ...t, key, name: part, manual: false })
    }
  return numbered(out)
}

// The names not asked about yet, 200 at a time.
export function chunksOf(names: TaskName[], asked: Set<string>): TaskName[][] {
  const left = names.filter((t) => !asked.has(t.key))
  const out: TaskName[][] = []
  for (let i = 0; i < left.length; i += chunkSize) out.push(left.slice(i, i + chunkSize))
  return out
}

// A line break in a tag would make a line of its own.
const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim()

const line = (t: TaskName, titles: string[]): string =>
  `${t.n} ${oneLine(t.name)}` + (titles.length ? ` | ${titles.map(oneLine).join('; ')}` : '')

// LIST with one title per name, CHECK with up to two.
export function userText(list: TaskName[], check: TaskName[]): string {
  return [
    'LIST',
    ...list.map((t) => line(t, t.titles.slice(0, 1))),
    'CHECK',
    ...check.map((t) => line(t, t.titles))
  ].join('\n')
}

// A rough token count, on the high side for names in other alphabets.
export const tokensOf = (text: string): number => Math.ceil(text.length / 3)

// The LIST in `parts` parts of about the same size, for a model that can't take it whole.
export function splitList(list: TaskName[], parts: number): TaskName[][] {
  const size = Math.ceil(list.length / parts)
  const out: TaskName[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

// One pair the model says is the same artist, smaller number first, so two
// answers can be compared whichever way round each gave it.
export type Pair = `${number}-${number}`

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// The answer comes parsed but unchecked. An item that is not the right shape,
// names a number not asked about, or pairs a name with itself is dropped,
// not the whole answer. Each pair keeps the model's reason, for the log.
export function pairsOf(
  json: unknown,
  checkIds: Set<number>,
  listIds: Set<number>
): Map<Pair, string> {
  const out = new Map<Pair, string>()
  if (!isObject(json) || !Array.isArray(json.matches)) return out
  for (const m of json.matches) {
    if (!isObject(m)) continue
    const { check, same, why } = m
    if (!Number.isInteger(check) || !Number.isInteger(same)) continue
    const c = check as number
    const s = same as number
    if (!checkIds.has(c) || !listIds.has(s) || c === s) continue
    out.set(c < s ? `${c}-${s}` : `${s}-${c}`, typeof why === 'string' ? why : '')
  }
  return out
}

// One tag the model split: the parts as written in the tag, and their keys
// sorted, so two answers can be compared in any order.
export interface Split {
  parts: string[]
  keys: string[]
  why: string
}

// The split answer comes parsed but unchecked. An item is dropped, not the
// whole answer, when it is not the right shape, is not about a CHECK line,
// or its parts are not names found in the tag (a made-up name, or one taken
// from an album title). dropped: one line per item, so mistakes show in the log.
export function splitsOf(
  json: unknown,
  chunk: TaskName[]
): { splits: Map<number, Split>; dropped: string[] } {
  const splits = new Map<number, Split>()
  const dropped: string[] = []
  if (!isObject(json) || !Array.isArray(json.tags)) return { splits, dropped }
  const byN = new Map(chunk.map((t) => [t.n, t]))
  for (const item of json.tags) {
    if (!isObject(item)) {
      dropped.push('an item that is not an object')
      continue
    }
    const { check, artists, why } = item
    const t = Number.isInteger(check) ? byN.get(check as number) : undefined
    if (!t) {
      dropped.push(`line ${JSON.stringify(check)}: not a CHECK line`)
      continue
    }
    const problem = splitProblem(t, artists, splits.has(t.n))
    if (typeof problem === 'string') {
      dropped.push(`${t.name}: ${problem}`)
      continue
    }
    splits.set(t.n, { ...problem, why: typeof why === 'string' ? why : '' })
  }
  return { splits, dropped }
}

// Why a split can't be used, or its parts and keys.
function splitProblem(t: TaskName, artists: unknown, seen: boolean): string | Omit<Split, 'why'> {
  if (seen) return 'answered twice'
  if (!Array.isArray(artists) || !artists.every((a) => typeof a === 'string'))
    return 'artists is not a list of names'
  const parts = (artists as string[]).map((a) => a.trim())
  if (!parts.length) return 'no parts'
  if (parts.length > maxNames) return `more than ${maxNames} parts`
  const tag = oneLine(t.name).toLowerCase()
  const keys = new Set<string>()
  for (const p of parts) {
    const key = artistKey(p)
    if (!key) return 'an empty part'
    if (p.length > maxNameLength) return 'a part is too long'
    if (!tag.includes(p.toLowerCase())) return `"${p}" is not in the tag`
    if (keys.has(key)) return `"${p}" twice`
    keys.add(key)
  }
  if (parts.length === 1 && keys.has(t.key)) return 'one part, the tag itself'
  return { parts, keys: [...keys].sort() }
}

// The same artists in two answers, in any order.
export const sameParts = (a: Split, b: Split): boolean =>
  a.keys.length === b.keys.length && a.keys.every((k, i) => k === b.keys[i])

// Splits both answers gave with the same parts, as the first one wrote them.
export function agreedSplits(a: Map<number, Split>, b: Map<number, Split>): Map<number, Split> {
  return new Map([...a].filter(([n, s]) => b.has(n) && sameParts(s, b.get(n)!)))
}

// Pairs both answers gave, with the first one's reason.
export function agreed(a: Map<Pair, string>, b: Map<Pair, string>): Map<Pair, string> {
  return new Map([...a].filter(([p]) => b.has(p)))
}

// Names joined by pairs: 3-2 and 2-17 make one group.
export class UnionFind {
  #parent = new Map<number, number>()

  find(x: number): number {
    let root = x
    while (this.#parent.has(root) && this.#parent.get(root) !== root) root = this.#parent.get(root)!
    // shorter paths for the next find
    while (x !== root) {
      const next = this.#parent.get(x) ?? root
      this.#parent.set(x, root)
      x = next
    }
    return root
  }

  union(a: number, b: number): void {
    for (const x of [a, b]) if (!this.#parent.has(x)) this.#parent.set(x, x)
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.#parent.set(Math.max(ra, rb), Math.min(ra, rb))
  }

  addPair(p: Pair): void {
    const [a, b] = p.split('-').map(Number)
    this.union(a, b)
  }

  // Every group of two or more, as numbers.
  groups(): number[][] {
    const by = new Map<number, number[]>()
    for (const x of this.#parent.keys()) {
      const r = this.find(x)
      let g = by.get(r)
      if (!g) by.set(r, (g = []))
      g.push(x)
    }
    return [...by.values()].filter((g) => g.length > 1).map((g) => g.sort((a, b) => a - b))
  }
}

// The name a group shows: never one the model picks. A name you gave comes
// first, so the tags join what the user chose; else the single spelling
// seen most often, the first seen on a tie (as in listArtists). Each member's
// own top spelling is the only one that can win.
export function shownName(members: TaskName[]): string {
  const pool = members.some((m) => m.manual) ? members.filter((m) => m.manual) : members
  let best = pool[0]
  for (const m of pool)
    if (m.count > best.count || (m.count === best.count && m.seen < best.seen)) best = m
  return best.name
}
