// The artist groups job on a fake AiClient: no provider, no network.
import { describe, expect, it } from 'vitest'
import type { AiClient, Answer, JsonRequest } from '../../../shared/ai'
import type { GroupsStatus } from '../../../shared/library'
import {
  noArtists,
  noCache,
  parseCache,
  resolve,
  serializeCache,
  type ArtistAiCache,
  type ArtistsFile
} from '../../../shared/plugins/files/artists-file'
import {
  fullCheckDue,
  groupArtists,
  limitWaitMs,
  startFullCheck,
  type JobEnd
} from './group-artists-job'
import {
  joinSchema,
  joinSystem,
  maxOutput,
  splitSchema,
  splitSystem,
  type TaskName
} from './group-artists'

interface Call {
  task: string
  req: JsonRequest
  avoid?: string[]
}

type Answers = (c: Call, i: number) => Answer | Promise<Answer>

// no tag split, from whichever model is asked
const noSplits: Answers = (c) => ({ ok: true, model: c.avoid ? 'm2' : 'm1', json: { tags: [] } })

// Answers each join ask with `answer(call, index)`, and each split ask with
// `o.split`. calls: the join asks, splits: the split asks, all: both in order.
function fakeAi(
  answer: Answers,
  o: { on?: boolean; max?: number; split?: Answers } = {}
): { ai: AiClient; calls: Call[]; splits: Call[]; all: Call[] } {
  const calls: Call[] = []
  const splits: Call[] = []
  const all: Call[] = []
  const ai: AiClient = {
    on: () => o.on ?? true,
    enabled: () => o.on ?? true,
    changed: () => () => {},
    maxInput: async () => ((o.on ?? true) ? (o.max ?? 256_000) : undefined),
    ask: async (task, req, signal, avoid) => {
      signal.throwIfAborted()
      const c: Call = { task, req, ...(avoid ? { avoid } : {}) }
      all.push(c)
      if (req.system === splitSystem) {
        splits.push(c)
        return (o.split ?? noSplits)(c, splits.length - 1)
      }
      calls.push(c)
      return answer(c, calls.length - 1)
    }
  }
  return { ai, calls, splits, all }
}

// a split answer: [check, parts][]
const parts = (tags: [number, string[]][], model = 'm1'): Answer => ({
  ok: true,
  model,
  json: { tags: tags.map(([check, artists]) => ({ check, artists, why: 'joint credit' })) }
})
const bothSplit = (tags: [number, string[]][]) => (c: Call) => parts(tags, c.avoid ? 'm2' : 'm1')

const ok = (pairs: [number, number][], model = 'm1'): Answer => ({
  ok: true,
  model,
  json: { matches: pairs.map(([check, same]) => ({ check, same, why: 'spelling' })) }
})

// the same pairs from whichever model is asked
const both = (pairs: [number, number][]) => (c: Call) => ok(pairs, c.avoid ? 'm2' : 'm1')

const plain = (list: string[], counts: number[] = []): TaskName[] =>
  list.map((name, i) => ({
    n: i + 1,
    key: name.toLowerCase().replace(/\s+/g, ''),
    name,
    titles: [`${name} album`],
    count: counts[i] ?? 1,
    seen: i,
    manual: false
  }))

const many = (n: number): string[] => Array.from({ length: n }, (_, i) => `N${i + 1}`)

interface Files {
  artists: ArtistsFile
  cache: ArtistAiCache
}
const fresh = (): Files => ({ artists: noArtists(), cache: noCache() })

function job(
  ai: AiClient,
  names: TaskName[],
  files: Files = fresh(),
  signal = new AbortController().signal
): {
  done: Promise<JobEnd>
  // tag key -> the name it shows, AI on
  groups: () => Record<string, string>
  cache: ArtistAiCache
  artists: ArtistsFile
  statuses: (GroupsStatus | undefined)[]
  saves: { asked: number; groups: Record<string, string> }[]
  logs: string[]
} {
  const statuses: (GroupsStatus | undefined)[] = []
  const saves: { asked: number; groups: Record<string, string> }[] = []
  const logs: string[] = []
  const { artists, cache } = files
  const groups = (): Record<string, string> =>
    Object.fromEntries([...resolve(artists, true)].map(([k, v]) => [k, v.names.join(', ')]))
  const done = groupArtists(
    {
      ai,
      names,
      artists,
      cache,
      // the tags in the library: names you gave are not tags
      spelling: (k) => names.find((t) => t.key === k && !t.manual)?.name,
      saved: () => saves.push({ asked: cache.joined.size, groups: groups() }),
      status: (s) => statuses.push(s),
      log: (t) => logs.push(t),
      now: () => 1000
    },
    signal
  )
  return { done, groups, cache, artists, statuses, saves, logs }
}

describe('the artist groups job', () => {
  it('asks with the system text, the schema and the output size, for the task', async () => {
    const { ai, calls } = fakeAi(both([]))
    await job(ai, plain(['Beatles', 'Bjork'])).done
    expect(calls[0]).toEqual({
      task: 'artist-groups',
      req: {
        system: joinSystem,
        schema: joinSchema,
        maxOutput,
        user: 'LIST\n1 Beatles | Beatles album\n2 Bjork | Bjork album\nCHECK\n1 Beatles | Beatles album\n2 Bjork | Bjork album'
      }
    })
    expect(maxOutput).toBe(32000)
  })

  it('makes no request when every name was asked', async () => {
    const { ai, calls } = fakeAi(both([]))
    const names = plain(['A', 'B'])
    const g = fresh()
    g.cache.joined = new Set(['a', 'b'])
    g.cache.split = new Set(['a', 'b'])
    const j = job(ai, names, g)
    expect(await j.done).toEqual({ end: 'done', joined: 0, split: 0, asked: false })
    expect(calls).toEqual([])
    expect(j.statuses).toEqual([])
  })

  it('asks 450 new names in 3 chunks, each asked twice', async () => {
    const { ai, calls } = fakeAi(both([]))
    const j = job(ai, plain(many(450)))
    await j.done
    expect(calls).toHaveLength(6)
    const checks = calls.map((c) => c.req.user.split('CHECK\n')[1].split('\n').length)
    expect(checks).toEqual([200, 200, 200, 200, 50, 50])
  })

  describe('two models', () => {
    it('asks the second without the first one, and keeps only pairs both gave', async () => {
      const { ai, calls } = fakeAi((c) =>
        c.avoid
          ? ok(
              [
                [4, 3],
                [2, 1]
              ],
              'm2'
            )
          : ok([
              [3, 4],
              [1, 5]
            ])
      )
      // in name order, as taskNames gives them: the join step numbers them so
      const j = job(ai, plain(['Beatles', 'Bjork', 'Björk', 'Björk!', 'The Beatles']))
      await j.done
      expect(calls.map((c) => c.avoid)).toEqual([undefined, ['m1']])
      expect(j.groups()).toEqual({ björk: 'Björk', 'björk!': 'Björk' })
    })

    it('keeps nothing of a chunk when no second model answers, and asks it again later', async () => {
      const { ai } = fakeAi((c) => (c.avoid ? { ok: false, error: 'failed' } : ok([[1, 2]])))
      const j = job(ai, plain(['Bjork', 'Björk']))
      expect(await j.done).toEqual({ end: 'failed' })
      expect(Object.keys(j.groups()).length).toBe(0)
      expect(j.cache.joined.size).toBe(0)
      expect(j.statuses.at(-1)).toEqual({ state: 'stopped', error: 'failed' })
    })
    describe('one model to use (a fixed choice, or only one fits)', () => {
      const avoided: Answer = {
        ok: false,
        error: 'failed',
        detail: 'every model avoided',
        avoided: true
      }

      it('asks the same model again and keeps the pairs both answers gave', async () => {
        const { ai, calls } = fakeAi((c, i) =>
          c.avoid
            ? avoided
            : ok(
                i === 0
                  ? [
                      [4, 3],
                      [5, 2]
                    ]
                  : [
                      [4, 3],
                      [5, 1]
                    ]
              )
        )
        const j = job(ai, plain(['Abba', 'Beatles', 'Bjork', 'Björk', 'The Beatles']))
        expect(await j.done).toEqual({ end: 'done', joined: 1, split: 0, asked: true })
        expect(calls.map((c) => c.avoid)).toEqual([undefined, ['m1'], undefined])
        expect(j.groups()).toEqual({ bjork: 'Bjork', björk: 'Bjork' })
        expect(j.statuses.at(-1)).toEqual({ state: 'done', joined: 1, split: 0, at: 1000 })
      })

      it('keeps nothing when the two answers disagree, and still marks the names asked', async () => {
        const { ai } = fakeAi((c, i) => (c.avoid ? avoided : ok(i === 0 ? [[2, 1]] : [[3, 1]])))
        const j = job(ai, plain(['Bjork', 'Björk', 'Bjorky']))
        expect(await j.done).toEqual({ end: 'done', joined: 0, split: 0, asked: true })
        expect(Object.keys(j.groups()).length).toBe(0)
        expect(j.cache.joined.size).toBe(3)
      })

      it('stops when the answer again fails', async () => {
        const { ai } = fakeAi((c, i) =>
          c.avoid ? avoided : i === 0 ? ok([[2, 1]]) : { ok: false, error: 'failed' }
        )
        const j = job(ai, plain(['Bjork', 'Björk']))
        expect(await j.done).toEqual({ end: 'failed' })
        expect(j.cache.joined.size).toBe(0)
      })
    })
  })

  describe('groups', () => {
    it('joins pairs across chunks into one group, shown by the most common spelling', async () => {
      // 250 names: 1-2 is found in the first chunk, 250-2 in the second
      const list = plain(many(250), [1, 5])
      const { ai } = fakeAi((c) =>
        c.req.user.split('CHECK\n')[1].startsWith('201 ')
          ? ok([[250, 2]], c.avoid ? 'm2' : 'm1')
          : ok([[1, 2]], c.avoid ? 'm2' : 'm1')
      )
      const j = job(ai, list)
      expect(await j.done).toMatchObject({ end: 'done', joined: 2, split: 0 })
      expect(j.groups()).toEqual({ n1: 'N2', n2: 'N2', n250: 'N2' })
    })

    it('joins a saved group and keeps its name', async () => {
      const g = fresh()
      g.artists.artists.push({
        name: 'Björk (saved)',
        nameBy: 'ai',
        tags: [{ tag: 'Bjork', by: 'ai' }]
      })
      g.cache.joined.add('bjork')
      const { ai } = fakeAi(both([[2, 1]]))
      const j = job(ai, plain(['Bjork', 'Björk', 'BJÖRK'], [1, 9, 1]), g)
      await j.done
      expect(j.groups()).toEqual({
        bjork: 'Björk (saved)',
        björk: 'Björk (saved)'
      })
    })

    it('skips tags linked by you and never changes your links, joining your artist', async () => {
      const g = fresh()
      g.artists.artists.push(
        { name: 'Björk', nameBy: 'you', tags: [{ tag: 'Bjork', by: 'you' }] },
        { name: 'Beatles', nameBy: 'you', tags: [{ tag: 'Beatles', by: 'you' }] }
      )
      const { ai } = fakeAi(
        both([
          [2, 1],
          [3, 1]
        ])
      )
      // "Björk" is the name you gave "Bjork" (manual), "BJORK" a new spelling
      const names = plain(['Björk', 'Bjork', 'BJORK!'])
      names[0].manual = true
      const j = job(ai, names, g)
      expect(await j.done).toMatchObject({ end: 'done', joined: 1, split: 0 })
      expect(j.artists.artists).toEqual([
        {
          name: 'Björk',
          nameBy: 'you',
          tags: [
            { tag: 'Bjork', by: 'you' },
            { tag: 'BJORK!', by: 'ai' }
          ]
        },
        { name: 'Beatles', nameBy: 'you', tags: [{ tag: 'Beatles', by: 'you' }] }
      ])
    })

    it('saves after each chunk, with more keys asked each time', async () => {
      const { ai } = fakeAi(both([[1, 2]]))
      const j = job(ai, plain(many(450)))
      await j.done
      // three split chunks first, then three join chunks
      expect(j.saves.map((s) => s.asked)).toEqual([0, 0, 0, 200, 400, 450])
      expect(j.saves[3].groups).toEqual({ n1: 'N1', n2: 'N1' })
    })

    it('stopped in the middle, keeps what was saved and throws', async () => {
      const stop = new AbortController()
      const { ai } = fakeAi((c, i) => {
        // the first ask of the second chunk
        if (i === 2) stop.abort()
        return ok([[1, 2]], c.avoid ? 'm2' : 'm1')
      })
      const j = job(ai, plain(many(450)), fresh(), stop.signal)
      await expect(j.done).rejects.toThrow()
      expect(j.cache.joined.size).toBe(200)
      expect(Object.keys(j.groups()).length).toBe(2)
      expect(j.saves).toHaveLength(4)
    })

    it('says how far it got, and how many names it joined and split', async () => {
      const { ai } = fakeAi(both([[1, 2]]))
      const j = job(ai, plain(many(250)))
      await j.done
      expect(j.statuses).toEqual([
        { state: 'running', step: 'split', checked: 0, total: 250 },
        { state: 'running', step: 'split', checked: 200, total: 250 },
        { state: 'running', step: 'join', checked: 0, total: 250 },
        { state: 'running', step: 'join', checked: 200, total: 250 },
        { state: 'done', joined: 1, split: 0, at: 1000 }
      ])
    })
  })

  describe('the split step (ticket 070)', () => {
    const credit = plain(['Forgoten', 'sadness', 'Sadness, Forgotten'])

    it('asks with the split text and schema, CHECK only the tags, before any join', async () => {
      const { ai, all } = fakeAi(both([]))
      const names = plain(['Abba', 'Kino'])
      // a name you gave is in LIST but is not a tag to split
      names[1].manual = true
      await job(ai, names).done
      expect(all[0]).toEqual({
        task: 'artist-groups',
        req: {
          system: splitSystem,
          schema: splitSchema,
          maxOutput,
          user: 'LIST\n1 Abba | Abba album\n2 Kino | Kino album\nCHECK\n1 Abba | Abba album'
        }
      })
      expect(all.map((c) => c.req.system)).toEqual([
        splitSystem,
        splitSystem,
        joinSystem,
        joinSystem
      ])
    })

    it('asks every split chunk before the first join', async () => {
      const { ai, all } = fakeAi(both([]))
      await job(ai, plain(many(250))).done
      expect(all.map((c) => (c.req.system === splitSystem ? 's' : 'j')).join('')).toBe('ssssjjjj')
    })

    it('saves a split both models gave, in any order, and logs it', async () => {
      const { ai, splits } = fakeAi(both([]), {
        split: (c) =>
          c.avoid
            ? parts([[3, ['forgotten', 'SADNESS']]], 'm2')
            : parts([[3, ['Sadness', 'Forgotten']]])
      })
      const j = job(ai, credit)
      expect(await j.done).toEqual({ end: 'done', joined: 0, split: 1, asked: true })
      expect(splits.map((c) => c.avoid)).toEqual([undefined, ['m1']])
      // "sadness" is a tag already: its spelling names the artist
      expect(j.artists.artists).toEqual([
        { name: 'sadness', nameBy: 'ai', tags: [{ tag: 'Sadness, Forgotten', by: 'ai' }] },
        { name: 'Forgotten', nameBy: 'ai', tags: [{ tag: 'Sadness, Forgotten', by: 'ai' }] }
      ])
      expect(j.cache.split).toEqual(new Set(['forgoten', 'sadness', 'sadness,forgotten']))
      expect(j.logs).toContain(
        'Artist groups: Sadness, Forgotten = Sadness + Forgotten (joint credit)'
      )
    })

    it('keeps nothing when the parts differ or one is missing, and logs dropped items', async () => {
      const { ai } = fakeAi(both([]), {
        split: (c) =>
          c.avoid
            ? parts(
                [
                  [3, ['Sadness']],
                  [2, ['sad', 'ness']]
                ],
                'm2'
              )
            : parts([
                [3, ['Sadness', 'Forgotten']],
                [1, ['Forgoten', 'Sadness']]
              ])
      })
      const j = job(ai, credit)
      expect(await j.done).toMatchObject({ end: 'done', joined: 0, split: 0 })
      expect(j.artists.artists).toEqual([])
      expect(j.logs).toContain(
        'Artist groups: dropped a split from m1: Forgoten: "Sadness" is not in the tag'
      )
      // the tags were asked all the same
      expect(j.cache.split.size).toBe(3)
    })

    it('asks the same model again when it is the only one', async () => {
      const avoided: Answer = { ok: false, error: 'failed', avoided: true }
      const { ai, splits } = fakeAi(both([]), {
        split: (c) => (c.avoid ? avoided : parts([[3, ['Sadness', 'Forgotten']]]))
      })
      const j = job(ai, credit)
      await j.done
      expect(splits.map((c) => c.avoid)).toEqual([undefined, ['m1'], undefined])
      expect(j.artists.artists).toHaveLength(2)
    })

    it('joins with the parts in place of the split tag, and counts both steps', async () => {
      const { ai, calls } = fakeAi(
        (c) =>
          // join LIST: 1 Forgoten, 2 Forgotten (a part), 3 sadness
          ok([[2, 1]], c.avoid ? 'm2' : 'm1'),
        { split: bothSplit([[3, ['Sadness', 'Forgotten']]]) }
      )
      const j = job(ai, credit)
      expect(await j.done).toEqual({ end: 'done', joined: 1, split: 1, asked: true })
      expect(calls[0].req.user.split('\nCHECK')[0]).toBe(
        'LIST\n1 Forgoten | Forgoten album\n2 Forgotten | Sadness, Forgotten album\n3 sadness | sadness album'
      )
      expect(j.artists.artists).toEqual([
        { name: 'sadness', nameBy: 'ai', tags: [{ tag: 'Sadness, Forgotten', by: 'ai' }] },
        {
          name: 'Forgotten',
          nameBy: 'ai',
          tags: [
            { tag: 'Sadness, Forgotten', by: 'ai' },
            { tag: 'Forgoten', by: 'ai' }
          ]
        }
      ])
      expect(j.cache.joined).toEqual(new Set(['forgoten', 'forgotten', 'sadness']))
    })

    it('never splits a tag you linked', async () => {
      const g = fresh()
      g.artists.artists.push({
        name: 'Sadness, Forgotten',
        nameBy: 'you',
        tags: [{ tag: 'Sadness, Forgotten', by: 'you' }]
      })
      const { ai } = fakeAi(both([]), { split: bothSplit([[3, ['Sadness', 'Forgotten']]]) })
      const j = job(ai, credit, g)
      expect(await j.done).toMatchObject({ joined: 0, split: 0 })
      expect(j.artists.artists).toHaveLength(1)
    })

    it('drops a tag split one way against one part of the LIST and another way against the next', async () => {
      const { ai, splits } = fakeAi(both([]), {
        split: (c) => {
          const list = c.req.user.split('\nCHECK')[0].split('\n').length - 1
          if (list > 2) return { ok: false, error: 'too-big' }
          const first = c.req.user.startsWith('LIST\n1 ')
          return parts(
            first
              ? [
                  [3, ['Sadness', 'Forgotten']],
                  [4, ['A', 'B']]
                ]
              : [
                  [3, ['Sadness', 'Forgot']],
                  [4, ['A', 'B']]
                ],
            c.avoid ? 'm2' : 'm1'
          )
        }
      })
      const j = job(ai, plain(['Forgoten', 'sadness', 'Sadness, Forgotten', 'A/B']))
      await j.done
      expect(splits.length).toBe(5)
      expect(Object.keys(j.groups())).toEqual(['a/b'])
    })
  })

  describe('a full check', () => {
    // Björk by the AI, and Kino linked by you
    const files = (): Files => {
      const g = fresh()
      g.artists.artists.push(
        { name: 'Björk', nameBy: 'ai', tags: [{ tag: 'Bjork', by: 'ai' }] },
        { name: 'Кино', nameBy: 'you', tags: [{ tag: 'Kino', by: 'you' }] }
      )
      g.cache.split = new Set(['bjork', 'björk'])
      g.cache.joined = new Set(['bjork', 'björk'])
      return g
    }
    const names = (): TaskName[] => {
      const n = plain(['Bjork', 'Björk', 'Кино'])
      n[2].manual = true
      return n
    }
    // an old split by the AI: "A, B" as A and B
    const oldSplit = (): Files => {
      const g = fresh()
      g.artists.artists.push(
        { name: 'A', nameBy: 'ai', tags: [{ tag: 'A, B', by: 'ai' }] },
        { name: 'B', nameBy: 'ai', tags: [{ tag: 'A, B', by: 'ai' }] }
      )
      startFullCheck(g.artists, g.cache)
      return g
    }
    // Pairs two names by how they are written, when both are in the request.
    const pairNames =
      (x: string, y: string) =>
      (c: Call): Answer => {
        const n = new Map(
          c.req.user
            .split('\nCHECK')[0]
            .split('\n')
            .slice(1)
            .map((l) => [l.split(' | ')[0].replace(/^\d+ /, ''), Number(l.split(' ')[0])])
        )
        const pair: [number, number][] = n.has(x) && n.has(y) ? [[n.get(x)!, n.get(y)!]] : []
        return ok(pair, c.avoid ? 'm2' : 'm1')
      }

    it('empties the asked keys and notes the tags with an AI link', () => {
      const g = files()
      startFullCheck(g.artists, g.cache)
      expect(g.cache.checking).toEqual(new Set(['bjork']))
      expect(g.cache.split.size + g.cache.joined.size).toBe(0)
    })

    it('is due when there are AI links, nothing was asked and no check is under way', () => {
      const g = files()
      expect(fullCheckDue(g.artists, g.cache)).toBe(false)
      g.cache = noCache(2)
      expect(fullCheckDue(g.artists, g.cache)).toBe(true)
      expect(fullCheckDue(noArtists(), g.cache)).toBe(false)
      startFullCheck(g.artists, g.cache)
      expect(fullCheckDue(g.artists, g.cache)).toBe(false)
    })

    it('removes the AI links no answer gave again when the run is done, never yours', async () => {
      const g = files()
      startFullCheck(g.artists, g.cache)
      const { ai, calls } = fakeAi(both([]))
      const j = job(ai, names(), g)
      expect(await j.done).toEqual({ end: 'done', joined: 0, split: 0, asked: true })
      expect(calls.length).toBe(2)
      expect(j.artists.artists).toEqual([
        { name: 'Кино', nameBy: 'you', tags: [{ tag: 'Kino', by: 'you' }] }
      ])
      expect(j.cache.checking.size).toBe(0)
      // saved after the links went
      expect(j.saves.at(-1)!.groups).toEqual({ kino: 'Кино' })
    })

    it('keeps a link an answer gave again', async () => {
      const g = files()
      startFullCheck(g.artists, g.cache)
      const { ai } = fakeAi(both([[1, 2]]))
      const j = job(ai, names(), g)
      expect(await j.done).toEqual({ end: 'done', joined: 0, split: 0, asked: true })
      expect(j.groups()).toEqual({ bjork: 'Björk', björk: 'Björk', kino: 'Кино' })
    })

    it('removes nothing when the run stops early, and goes on after a restart', async () => {
      const g = files()
      startFullCheck(g.artists, g.cache)
      const first = fakeAi(() => ({ ok: false, error: 'limit', retryAt: 5000 }))
      const j = job(first.ai, names(), g)
      expect(await j.done).toEqual({ end: 'limit', retryAt: 5000 })
      expect(j.groups()).toMatchObject({ bjork: 'Björk' })
      // the cache file as a restart reads it
      const cache = parseCache(JSON.parse(JSON.stringify(serializeCache(g.cache))), g.cache.prompt)
      expect(cache.checking).toEqual(new Set(['bjork']))
      const next = fakeAi(both([]))
      await job(next.ai, names(), { artists: g.artists, cache }).done
      expect(next.splits).toEqual([])
      expect(g.artists.artists).toHaveLength(1)
      expect(cache.checking.size).toBe(0)
    })

    it('keeps an old split an answer gave again', async () => {
      const { ai, calls } = fakeAi(both([]), { split: bothSplit([[1, ['A', 'B']]]) })
      const j = job(ai, plain(['A, B']), oldSplit())
      await j.done
      expect(j.groups()).toEqual({ 'a,b': 'A, B' })
      expect(j.artists.artists).toHaveLength(2)
      // its parts were asked in the join step
      expect(calls[0].req.user.split('CHECK\n')[1]).toBe('1 A | A, B album\n2 B | A, B album')
    })

    it('asks about an old split no answer gave again as the tag itself, so no join is built on it', async () => {
      const { ai, calls } = fakeAi(pairNames('B', 'Bee'))
      const j = job(ai, plain(['A, B', 'Bee']), oldSplit())
      expect(await j.done).toMatchObject({ end: 'done' })
      expect(calls.map((c) => c.req.user.split('CHECK\n')[1])).toEqual([
        '1 A, B | A, B album\n2 Bee | Bee album',
        '1 A, B | A, B album\n2 Bee | Bee album'
      ])
      // no artist B holding "Bee", nothing left of the split
      expect(j.artists.artists).toEqual([])
    })

    it('lets a join replace an old split no answer gave again', async () => {
      const { ai } = fakeAi(pairNames('A, B', 'A-B'))
      const j = job(ai, plain(['A, B', 'A-B']), oldSplit())
      expect(await j.done).toEqual({ end: 'done', joined: 1, split: 0, asked: true })
      expect(j.artists.artists).toEqual([
        {
          name: 'A, B',
          nameBy: 'ai',
          tags: [
            { tag: 'A-B', by: 'ai' },
            { tag: 'A, B', by: 'ai' }
          ]
        }
      ])
    })

    // The tag is asked about although you linked it (you linked it while
    // the run went on), so the save runs and is skipped.
    it('leaves a tag linked by you in the check when the split save skips it', async () => {
      const g = oldSplit()
      g.artists.artists.push({ name: 'Mine', nameBy: 'you', tags: [{ tag: 'A, B', by: 'you' }] })
      const { ai } = fakeAi(both([]), { split: bothSplit([[1, ['A', 'B']]]) })
      const j = job(ai, plain(['A, B']), g)
      await j.done
      // your link stays, the old AI links go
      expect(j.artists.artists).toEqual([
        { name: 'Mine', nameBy: 'you', tags: [{ tag: 'A, B', by: 'you' }] }
      ])
    })

    it('leaves a tag linked by you in the check when the group save skips it', async () => {
      const g = fresh()
      g.artists.artists.push(
        { name: 'Björk', nameBy: 'ai', tags: [{ tag: 'Bjork', by: 'ai' }] },
        { name: 'Mine', nameBy: 'you', tags: [{ tag: 'Bjork', by: 'you' }] }
      )
      startFullCheck(g.artists, g.cache)
      const { ai } = fakeAi(both([[1, 2]]))
      const j = job(ai, plain(['Bjork', 'Björk']), g)
      await j.done
      expect(j.artists.artists).toEqual([
        { name: 'Björk', nameBy: 'ai', tags: [{ tag: 'Björk', by: 'ai' }] },
        { name: 'Mine', nameBy: 'you', tags: [{ tag: 'Bjork', by: 'you' }] }
      ])
    })
  })

  describe('errors', () => {
    it('off: asks nothing while the task is off', async () => {
      const { ai, calls } = fakeAi(both([]), { on: false })
      const j = job(ai, plain(['A', 'B']))
      expect(await j.done).toEqual({ end: 'off' })
      expect(calls).toEqual([])
      expect(j.statuses).toEqual([undefined])
    })

    it('off: stops when an answer says so', async () => {
      const { ai } = fakeAi(() => ({ ok: false, error: 'off' }))
      const j = job(ai, plain(['A', 'B']))
      expect(await j.done).toEqual({ end: 'off' })
      expect(j.cache.joined.size).toBe(0)
    })

    it('limit: stops and says when it goes on', async () => {
      const { ai } = fakeAi((c, i) =>
        i < 2 ? ok([], c.avoid ? 'm2' : 'm1') : { ok: false, error: 'limit', retryAt: 5000 }
      )
      const j = job(ai, plain(many(250)))
      expect(await j.done).toEqual({ end: 'limit', retryAt: 5000 })
      expect(j.cache.joined.size).toBe(200)
      expect(j.statuses.at(-1)).toEqual({ state: 'limit', at: 5000 })
    })

    it('failed: a maxInput that throws ends the run as failed, with its line', async () => {
      const { ai, calls } = fakeAi(both([]))
      ai.maxInput = async () => Promise.reject(new Error('maxInput failed'))
      const j = job(ai, plain(['A', 'B']))
      expect(await j.done).toEqual({ end: 'failed' })
      expect(calls).toEqual([])
      expect(j.statuses.at(-1)).toEqual({ state: 'stopped', error: 'failed' })
    })

    it('network: maxInput gives nothing while the task is still on (no model list)', async () => {
      const { ai, calls } = fakeAi(both([]))
      ai.maxInput = async () => undefined
      const j = job(ai, plain(['A', 'B']))
      expect(await j.done).toEqual({ end: 'network' })
      expect(calls).toEqual([])
      expect(j.statuses.at(-1)).toEqual({ state: 'stopped', error: 'network' })
    })

    it('a stop during maxInput still throws', async () => {
      const stop = new AbortController()
      const { ai } = fakeAi(both([]))
      ai.maxInput = async () => {
        stop.abort()
        throw new Error('aborted')
      }
      await expect(job(ai, plain(['A', 'B']), fresh(), stop.signal).done).rejects.toThrow()
    })

    it('auth: stops with no line of its own (the provider shows its login)', async () => {
      const { ai } = fakeAi(() => ({ ok: false, error: 'auth' }))
      const j = job(ai, plain(['A', 'B']))
      expect(await j.done).toEqual({ end: 'auth' })
      expect(j.statuses.at(-1)).toBeUndefined()
    })

    it('network and failed: stop this run and say so', async () => {
      for (const error of ['network', 'failed'] as const) {
        const { ai } = fakeAi(() => ({ ok: false, error }))
        const j = job(ai, plain(['A', 'B']))
        expect(await j.done).toEqual({ end: error })
        expect(j.statuses.at(-1)).toEqual({ state: 'stopped', error })
        expect(j.cache.joined.size).toBe(0)
      }
    })

    it('too-big: splits the LIST and asks each chunk against each part', async () => {
      const { ai, calls } = fakeAi((c) => {
        const listLines = c.req.user.split('\nCHECK')[0].split('\n').length - 1
        if (listLines > 2) return { ok: false, error: 'too-big' }
        // each part keeps the pairs whose LIST name is in it: 4-1 the first, 3-4 the second
        return ok(
          [
            [3, 4],
            [4, 1]
          ],
          c.avoid ? 'm2' : 'm1'
        )
      })
      const j = job(ai, plain(['A', 'B', 'C', 'D']))
      expect(await j.done).toMatchObject({ end: 'done' })
      // the whole LIST once (too big), then two parts, each asked twice
      const parts = calls.map((c) => c.req.user.split('\nCHECK')[0])
      expect(parts.slice(1)).toEqual([
        'LIST\n1 A | A album\n2 B | B album',
        'LIST\n1 A | A album\n2 B | B album',
        'LIST\n3 C | C album\n4 D | D album',
        'LIST\n3 C | C album\n4 D | D album'
      ])
      expect(j.groups()).toEqual({ a: 'A', c: 'A', d: 'A' })
    })

    it('splits the LIST before asking when maxInput says it will not fit', async () => {
      const { ai, calls } = fakeAi(both([]), { max: 400 })
      await job(ai, plain(many(40))).done
      const lists = calls.map((c) => c.req.user.split('\nCHECK')[0].split('\n').length - 1)
      expect(lists.length).toBeGreaterThan(2)
      expect(lists.reduce((a, b) => a + b, 0)).toBe(40 * 2)
    })
  })

  it('waits at least 30 s after a limit, and at most what setTimeout takes', () => {
    expect(limitWaitMs(1000 + 3600_000, 1000)).toBe(3600_000)
    expect(limitWaitMs(500, 1000)).toBe(30_000)
    expect(limitWaitMs(1000 + 10_000, 1000)).toBe(30_000)
    expect(limitWaitMs(1e15, 0)).toBe(2 ** 31 - 1)
  })
})
