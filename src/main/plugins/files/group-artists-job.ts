// One run of the artist groups task (tickets 068, 070), in two steps over
// the names not asked yet, 200 at a time: first which artists a tag names
// (split), then which names are one artist (join). It saves after each
// chunk, so a stop or a limit loses nothing. It talks only to AiClient: in
// the library process that is messages to main, which has the key.
import type { AiClient, Answer, AnswerError, JsonRequest, JsonSchema } from '../../../shared/ai'
import type { GroupsStatus } from '../../../shared/library'
import {
  addAiGroup,
  addAiSplit,
  addAsked,
  aiKeys,
  aiSplits,
  artistGroupsTask,
  dropStale,
  type ArtistAiCache,
  type ArtistsFile,
  type Spelling
} from '../../../shared/plugins/files/artists-file'
import { artistKey } from '../../../shared/plugins/files/artists'
import {
  agreed,
  agreedSplits,
  chunksOf,
  joinNames,
  joinSchema,
  joinSystem,
  maxOutput,
  pairsOf,
  shownName,
  splitList,
  splitSchema,
  splitsOf,
  splitSystem,
  tokensOf,
  UnionFind,
  userText,
  type Pair,
  type Split,
  type TaskName
} from './group-artists'

// How a run ended. done: every name was asked about; asked: a request was made.
export type JobEnd =
  | { end: 'done'; grouped: number; asked: boolean }
  | { end: 'limit'; retryAt?: number }
  | { end: Exclude<AnswerError, 'limit' | 'too-big'> }

export interface JobDeps {
  ai: AiClient
  // every name the task knows, numbered (taskNames)
  names: TaskName[]
  // artists.json and the keys asked; changed in place
  artists: ArtistsFile
  cache: ArtistAiCache
  // a tag key's spelling in the library, for the links
  spelling: Spelling
  // During a full check (startFullCheck): tag keys whose AI links no answer
  // gave again yet. Changed in place. When the run is done, the rest lose
  // their AI links; a run that stops early removes nothing.
  stale?: Set<string>
  // a chunk was done: save the file and show the groups
  saved(): void
  // undefined: no line to show (the task is off, or the provider asks for a login)
  status(s: GroupsStatus | undefined): void
  log(text: string): void
  now(): number
}

const task = artistGroupsTask

// the longest wait setTimeout takes
const maxWaitMs = 2 ** 31 - 1
// a reset time already past would ask again at once, over and over
const minWaitMs = 30_000

// How long to wait after a limit before the next run.
export const limitWaitMs = (retryAt: number, now: number): number =>
  Math.min(maxWaitMs, Math.max(minWaitMs, retryAt - now))

// A full check asks every name again: both sets of the cache are emptied,
// and the tags with an AI link now are stale until an answer gives them one
// again. Pass the keys as JobDeps.stale until a run ends as done.
export function startFullCheck(artists: ArtistsFile, cache: ArtistAiCache): Set<string> {
  cache.split.clear()
  cache.joined.clear()
  return aiKeys(artists)
}

// AI links with nothing asked under this prompt number: the cache was made
// with another one (it then loads empty), or a full check stopped before its
// first chunk. Either way every name is asked again.
export const fullCheckDue = (artists: ArtistsFile, cache: ArtistAiCache): boolean =>
  !cache.split.size && !cache.joined.size && aiKeys(artists).size > 0

// An abort rejects ask and maxInput, so it ends the run by throwing; what was
// saved stays and the next run goes on from the keys asked.
export async function groupArtists(d: JobDeps, signal: AbortSignal): Promise<JobEnd> {
  let end = await run(d, signal)
  if (end.end === 'done' && d.stale) {
    const stale = [...d.stale]
    d.stale.clear()
    if (dropStale(d.artists, stale)) {
      d.log(`Artist groups: removed the AI links no answer gave again (${stale.length} tags)`)
      d.saved()
      // a tag no longer split was not asked in the join step: its parts were
      const again = await run({ ...d, stale: undefined }, signal)
      end =
        again.end === 'done'
          ? { end: 'done', grouped: end.grouped + again.grouped, asked: true }
          : again
    }
  }
  if (end.end === 'done') {
    if (end.asked) d.status({ state: 'done', grouped: end.grouped, at: d.now() })
  } else if (end.end === 'limit') d.status({ state: 'limit', at: end.retryAt })
  // failed is a real failure: one usable model is asked twice, not failed
  else if (end.end === 'network' || end.end === 'failed')
    d.status({ state: 'stopped', error: end.end })
  else d.status(undefined)
  if (end.end !== 'done') d.log(`Artist groups: stopped (${end.end})`)
  return end
}

// What one step sends and keeps.
interface Step<T> {
  system: string
  schema: JsonSchema
  // what two answers agree on, for one chunk and one part of the LIST
  agree(first: Answered, second: Answered, chunk: TaskName[], part: TaskName[]): T
}

type Answered = Extract<Answer, { ok: true }>

async function run(d: JobDeps, signal: AbortSignal): Promise<JobEnd> {
  const { ai, names, artists, cache } = d
  if (!ai.on(task)) return { end: 'off' }
  // names you gave are not tags: there is nothing to split
  const tags = names.filter((t) => !t.manual)
  const splitChunks = chunksOf(tags, cache.split)
  if (!splitChunks.length && !chunksOf(joinNames(names, aiSplits(artists)), cache.joined).length)
    return { end: 'done', grouped: 0, asked: false }
  let max: number | undefined
  try {
    max = await ai.maxInput(task, maxOutput, signal)
  } catch (e) {
    // a stop still ends the run by throwing
    signal.throwIfAborted()
    d.log(`Artist groups: ${e}`)
    return { end: 'failed' }
  }
  // still on: the provider had no model list to give
  if (max === undefined) return { end: ai.on(task) ? 'network' : 'off' }

  // tag keys whose AI links changed this run
  const grouped = new Set<string>()
  const save = (change: () => void): void => {
    const before = aiLinks(artists)
    change()
    for (const [k, v] of aiLinks(artists)) if (before.get(k) !== v) grouped.add(k)
  }

  // Step 1: which artists each tag names. All chunks before step 2, so
  // step 2 sees every split.
  const nameOf = new Map(names.map((t) => [t.key, t.name]))
  const split: Step<Map<number, Split>> = {
    system: splitSystem,
    schema: splitSchema,
    agree: (a, b, chunk) => {
      const splits = (x: Answered): Map<number, Split> => {
        const r = splitsOf(x.json, chunk)
        for (const why of r.dropped) d.log(`Artist groups: dropped a split from ${x.model}: ${why}`)
        return r.splits
      }
      return agreedSplits(splits(a), splits(b))
    }
  }
  const splitParts = {
    n: splitChunks.length ? partsFor(splitSystem, names, splitChunks[0], max) : 1
  }
  for (const chunk of splitChunks) {
    d.status({
      state: 'running',
      step: 'split',
      checked: tags.filter((t) => cache.split.has(t.key)).length,
      total: tags.length
    })
    const r = await askAll(ai, split, names, chunk, splitParts, signal)
    if (!Array.isArray(r)) return r
    const byN = new Map(chunk.map((t) => [t.n, t]))
    for (const [n, s] of mergeSplits(r)) {
      const t = byN.get(n)!
      d.log(`Artist groups: ${t.name} = ${s.parts.join(' + ')}` + (s.why ? ` (${s.why})` : ''))
      d.stale?.delete(t.key)
      save(() => addAiSplit(artists, t.key, s.parts, d.spelling, (k) => nameOf.get(k)))
    }
    addAsked(
      cache.split,
      chunk.map((t) => t.key)
    )
    d.saved()
  }

  // Step 2: which names are one artist, with split tags as their parts.
  const list = joinNames(names, aiSplits(artists))
  const joinChunks = chunksOf(list, cache.joined)
  const join: Step<Map<Pair, string>> = {
    system: joinSystem,
    schema: joinSchema,
    agree: (a, b, chunk, part) => {
      const checkIds = new Set(chunk.map((t) => t.n))
      const listIds = new Set(part.map((t) => t.n))
      return agreed(pairsOf(a.json, checkIds, listIds), pairsOf(b.json, checkIds, listIds))
    }
  }
  const joinParts = { n: joinChunks.length ? partsFor(joinSystem, list, joinChunks[0], max) : 1 }
  const byN = new Map(list.map((t) => [t.n, t]))
  const uf = new UnionFind()
  for (const chunk of joinChunks) {
    d.status({
      state: 'running',
      step: 'join',
      checked: list.filter((t) => cache.joined.has(t.key)).length,
      total: list.length
    })
    const r = await askAll(ai, join, list, chunk, joinParts, signal)
    if (!Array.isArray(r)) return r
    for (const pairs of r)
      for (const [p, why] of pairs) {
        uf.addPair(p)
        const [a, b] = p.split('-').map((n) => byN.get(Number(n))!.name)
        d.log(`Artist groups: ${a} = ${b}` + (why ? ` (${why})` : ''))
      }
    for (const g of uf.groups()) {
      const members = g.map((n) => byN.get(n)!)
      for (const m of members) d.stale?.delete(m.key)
      save(() =>
        addAiGroup(
          artists,
          members.map((m) => m.key),
          shownName(members),
          d.spelling
        )
      )
    }
    addAsked(
      cache.joined,
      chunk.map((t) => t.key)
    )
    d.saved()
  }
  return { end: 'done', grouped: grouped.size, asked: true }
}

// How many parts the LIST is cut into so a request with it fits.
function partsFor(system: string, list: TaskName[], chunk: TaskName[], max: number): number {
  const fits = (p: number): boolean =>
    splitList(list, p).every((part) => tokensOf(system) + tokensOf(userText(part, chunk)) <= max)
  let parts = 1
  while (parts < list.length && !fits(parts)) parts *= 2
  return parts
}

// A tag kept in one part of the LIST and split another way in a later one
// is dropped: the answers disagree.
function mergeSplits(perPart: Map<number, Split>[]): Map<number, Split> {
  const out = new Map<number, Split>()
  const off = new Set<number>()
  for (const splits of perPart)
    for (const [n, s] of splits) {
      const had = out.get(n)
      if (had && had.keys.join('\n') !== s.keys.join('\n')) off.add(n)
      else out.set(n, s)
    }
  for (const n of off) out.delete(n)
  return out
}

// tag key -> the artists its AI links go to, to see which tags a save changed
function aiLinks(f: ArtistsFile): Map<string, string> {
  const out = new Map<string, string[]>()
  for (const a of f.artists)
    for (const l of a.tags) {
      if (l.by !== 'ai') continue
      const k = artistKey(l.tag)
      const v = out.get(k)
      if (v) v.push(a.name)
      else out.set(k, [a.name])
    }
  return new Map([...out].map(([k, v]) => [k, v.sort().join('\n')]))
}

// One chunk against every part of the LIST (more parts while it is too big).
// One result per part.
async function askAll<T>(
  ai: AiClient,
  step: Step<T>,
  list: TaskName[],
  chunk: TaskName[],
  parts: { n: number },
  signal: AbortSignal
): Promise<T[] | JobEnd> {
  for (;;) {
    const r = await askChunk(ai, step, list, chunk, parts.n, signal)
    if (r !== 'too-big') return r
    // no part smaller than one name
    if (parts.n >= list.length) return { end: 'failed' }
    parts.n *= 2
  }
}

// Each part asked twice: only what two models both gave is kept. With only
// one model to use (a fixed choice, or one that fits) it is asked twice
// instead, and the two answers must agree. A second answer that fails keeps
// nothing of the chunk, so it is asked again later.
async function askChunk<T>(
  ai: AiClient,
  step: Step<T>,
  list: TaskName[],
  chunk: TaskName[],
  parts: number,
  signal: AbortSignal
): Promise<T[] | 'too-big' | JobEnd> {
  const out: T[] = []
  for (const part of splitList(list, parts)) {
    const req: JsonRequest = {
      system: step.system,
      user: userText(part, chunk),
      schema: step.schema,
      maxOutput
    }
    const first = await ai.ask(task, req, signal)
    if (!first.ok) return stopFor(first)
    let second = await ai.ask(task, req, signal, [first.model])
    if (!second.ok && second.avoided) second = await ai.ask(task, req, signal)
    if (!second.ok) return stopFor(second)
    out.push(step.agree(first, second, chunk, part))
  }
  return out
}

function stopFor(a: Extract<Answer, { ok: false }>): 'too-big' | JobEnd {
  if (a.error === 'too-big') return 'too-big'
  if (a.error === 'limit') return { end: 'limit', retryAt: a.retryAt }
  return { end: a.error }
}
