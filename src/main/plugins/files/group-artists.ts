// The artist groups task's request and answer (ticket 068): which names go to
// the model, the text it gets, and what of its answer is kept. Plain functions,
// so they are tested without a model; the job that asks is group-artists-job.ts.
import type { Album, ArtistCredit, Track } from '../../../shared/library'
import type { JsonSchema } from '../../../shared/ai'
import { artistKey, namesOf, tagOf } from '../../../shared/plugins/files/artists'
import { lookUpArtist } from './artist-photo'
import { checksOf } from './group'

// One name the task knows: a tag with no manual override, or a name an
// override gives (so a tag can join it).
export interface TaskName {
  // the line's number: its place in the sorted list, from 1
  n: number
  key: string
  // the spelling seen most often
  name: string
  // up to two album or song titles, albums first
  titles: string[]
  // how often it is credited, one per album and per song
  count: number
  // a manual override gives it
  manual: boolean
}

// About quality, not size: small models get careless with thousands of names at once.
export const chunkSize = 200

export const system = `You get artist names from one person's music library. The tags were typed by
different people, so one artist can appear under several spellings.

For each line under CHECK, find the line in LIST that is the same artist, if any.

Same artist:
- spelling, accents or punctuation: Bjork / Björk, Guns N Roses / Guns N' Roses
- with or without "The": Beatles / The Beatles
- the same name in another alphabet: Kino / Кино
- a short and a full name: ELO / Electric Light Orchestra

Not the same artist:
- a joint credit and one of its members: Sadness / Sadness, Stellafera;
  Drake / Drake feat. Rihanna
- different artists with similar names: Bush / Kate Bush
- anything you are not sure about. A missed match is fine, a wrong one is not.

Use the album titles to tell artists apart. Answer only with JSON.`

export const schema: JsonSchema = {
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

export const maxOutput = 8000

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

// Every name the task knows, sorted and numbered. Names like "Various
// Artists" and "Unknown artist" match anyone, so they are left out.
export function taskNames(albums: Album[], tracks: Track[]): TaskName[] {
  const byId = new Map(tracks.map((t) => [t.id, t]))
  const byKey = new Map<
    string,
    { spellings: Map<string, number>; manual: boolean; own: Album[]; also: Track[]; songs: Track[] }
  >()
  // the names a credit gives the task: the tag, or an override's names
  const namesFor = (c: ArtistCredit): { names: string[]; manual: boolean } =>
    c.artistTag === undefined || c.grouped
      ? { names: [tagOf(c)], manual: false }
      : { names: namesOf(c), manual: true }
  const credit = (c: ArtistCredit): Set<string> => {
    const keys = new Set<string>()
    const { names, manual } = namesFor(c)
    for (const name of names) {
      const key = artistKey(name)
      if (!key || keys.has(key)) continue
      keys.add(key)
      let e = byKey.get(key)
      if (!e) byKey.set(key, (e = { spellings: new Map(), manual, own: [], also: [], songs: [] }))
      e.spellings.set(name, (e.spellings.get(name) ?? 0) + 1)
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
    let best = 0
    let count = 0
    // the first one seen wins a tie, as in listArtists
    for (const [s, c] of e.spellings) {
      count += c
      if (c > best) {
        best = c
        name = s
      }
    }
    if (!lookUpArtist(name)) continue
    const titles = checksOf(e.own, e.also, e.songs)
      .slice(0, 2)
      .map((c) => c.title)
    out.push({ n: 0, key, name, titles, count, manual: e.manual })
  }
  out.sort((x, y) => collator.compare(x.name, y.name) || (x.key < y.key ? -1 : 1))
  out.forEach((t, i) => (t.n = i + 1))
  return out
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

// The name a group shows: never one the model picks. A name a manual
// override gives comes first, so the tags join what the user chose; else the
// spelling seen most often, the first in the list on a tie.
export function shownName(members: TaskName[]): string {
  const pool = members.some((m) => m.manual) ? members.filter((m) => m.manual) : members
  let best = pool[0]
  for (const m of pool) if (m.count > best.count) best = m
  return best.name
}
