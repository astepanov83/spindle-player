// One run of the artist groups task (ticket 068): asks the model about the
// names not asked yet, 200 at a time, and saves the groups after each chunk,
// so a stop or a limit loses nothing. It talks only to AiClient: in the
// library process that is messages to main, which has the key.
import type { AiClient, Answer, AnswerError, JsonRequest } from '../../../shared/ai'
import type { GroupsStatus } from '../../../shared/library'
import {
  addAiGroup,
  addAsked,
  aiKeys,
  artistGroupsTask,
  type ArtistAiCache,
  type ArtistsFile,
  type Spelling
} from '../../../shared/plugins/files/artists-file'
import {
  agreed,
  chunksOf,
  maxOutput,
  pairsOf,
  schema,
  shownName,
  splitList,
  system,
  tokensOf,
  UnionFind,
  userText,
  type Pair,
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

// An abort rejects ask and maxInput, so it ends the run by throwing; what was
// saved stays and the next run goes on from `asked`.
export async function groupArtists(d: JobDeps, signal: AbortSignal): Promise<JobEnd> {
  const end = await run(d, signal)
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

async function run(d: JobDeps, signal: AbortSignal): Promise<JobEnd> {
  const { ai, names, artists, cache } = d
  if (!ai.on(task)) return { end: 'off' }
  const chunks = chunksOf(names, cache.joined)
  if (!chunks.length) return { end: 'done', grouped: 0, asked: false }
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
  // the LIST is split when a request with it whole would not fit
  let parts = 1
  const fits = (p: number): boolean =>
    splitList(names, p).every(
      (part) => tokensOf(system) + tokensOf(userText(part, chunks[0])) <= max
    )
  while (parts < names.length && !fits(parts)) parts *= 2

  const byN = new Map(names.map((t) => [t.n, t]))
  const uf = new UnionFind()
  let grouped = 0
  for (const chunk of chunks) {
    d.status({
      state: 'running',
      checked: names.filter((t) => cache.joined.has(t.key)).length,
      total: names.length
    })
    let pairs: Map<Pair, string> | undefined
    for (;;) {
      const r = await askChunk(ai, names, chunk, parts, signal)
      if (r !== 'too-big') {
        if ('end' in r) return r
        pairs = r
        break
      }
      // no part smaller than one name
      if (parts >= names.length) return { end: 'failed' }
      parts *= 2
    }
    for (const [p, why] of pairs) {
      uf.addPair(p)
      const [a, b] = p.split('-').map((n) => byN.get(Number(n))!.name)
      d.log(`Artist groups: ${a} = ${b}` + (why ? ` (${why})` : ''))
    }
    const before = aiKeys(artists)
    for (const g of uf.groups()) {
      const members = g.map((n) => byN.get(n)!)
      addAiGroup(
        artists,
        members.map((m) => m.key),
        shownName(members),
        d.spelling
      )
    }
    for (const k of aiKeys(artists)) if (!before.has(k)) grouped++
    addAsked(
      cache.joined,
      chunk.map((t) => t.key)
    )
    d.saved()
  }
  return { end: 'done', grouped, asked: true }
}

// One chunk against every part of the LIST, each asked twice: only pairs two
// models both gave are kept. With only one model to use (a fixed choice, or
// one that fits) it is asked twice instead, and the two answers must agree.
// A second answer that fails keeps nothing of the chunk, so it is asked
// again later.
async function askChunk(
  ai: AiClient,
  names: TaskName[],
  chunk: TaskName[],
  parts: number,
  signal: AbortSignal
): Promise<Map<Pair, string> | 'too-big' | JobEnd> {
  const checkIds = new Set(chunk.map((t) => t.n))
  const out = new Map<Pair, string>()
  for (const part of splitList(names, parts)) {
    const req: JsonRequest = { system, user: userText(part, chunk), schema, maxOutput }
    const first = await ai.ask(task, req, signal)
    if (!first.ok) return stopFor(first)
    let second = await ai.ask(task, req, signal, [first.model])
    if (!second.ok && second.avoided) second = await ai.ask(task, req, signal)
    if (!second.ok) return stopFor(second)
    const listIds = new Set(part.map((t) => t.n))
    const both = agreed(
      pairsOf(first.json, checkIds, listIds),
      pairsOf(second.json, checkIds, listIds)
    )
    for (const [p, why] of both) out.set(p, why)
  }
  return out
}

function stopFor(a: Extract<Answer, { ok: false }>): 'too-big' | JobEnd {
  if (a.error === 'too-big') return 'too-big'
  if (a.error === 'limit') return { end: 'limit', retryAt: a.retryAt }
  return { end: a.error }
}
