// The artist groups job on a fake AiClient: no provider, no network.
import { describe, expect, it } from 'vitest'
import type { AiClient, Answer, JsonRequest } from '../../../shared/ai'
import type { GroupsStatus } from '../../../shared/library'
import { noGroups, type ArtistGroups } from '../../../shared/plugins/files/artist-groups'
import { groupArtists, type JobEnd } from './group-artists-job'
import { maxOutput, schema, system, type TaskName } from './group-artists'

interface Call {
  task: string
  req: JsonRequest
  avoid?: string[]
}

// Answers each ask with `answer(call, index)`.
function fakeAi(
  answer: (c: Call, i: number) => Answer | Promise<Answer>,
  o: { on?: boolean; max?: number } = {}
): { ai: AiClient; calls: Call[] } {
  const calls: Call[] = []
  const ai: AiClient = {
    on: () => o.on ?? true,
    changed: () => () => {},
    maxInput: async () => ((o.on ?? true) ? (o.max ?? 256_000) : undefined),
    ask: async (task, req, signal, avoid) => {
      signal.throwIfAborted()
      const c: Call = { task, req, ...(avoid ? { avoid } : {}) }
      calls.push(c)
      return answer(c, calls.length - 1)
    }
  }
  return { ai, calls }
}

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
    manual: false
  }))

const many = (n: number): string[] => Array.from({ length: n }, (_, i) => `N${i + 1}`)

function job(
  ai: AiClient,
  names: TaskName[],
  groups: ArtistGroups = noGroups(),
  signal = new AbortController().signal
): {
  done: Promise<JobEnd>
  groups: ArtistGroups
  statuses: (GroupsStatus | undefined)[]
  saves: { asked: number; groups: Record<string, string> }[]
} {
  const statuses: (GroupsStatus | undefined)[] = []
  const saves: { asked: number; groups: Record<string, string> }[] = []
  const done = groupArtists(
    {
      ai,
      names,
      groups,
      saved: () =>
        saves.push({ asked: groups.asked.size, groups: Object.fromEntries(groups.groups) }),
      status: (s) => statuses.push(s),
      log: () => {},
      now: () => 1000
    },
    signal
  )
  return { done, groups, statuses, saves }
}

describe('the artist groups job', () => {
  it('asks with the system text, the schema and the output size, for the task', async () => {
    const { ai, calls } = fakeAi(both([]))
    await job(ai, plain(['Beatles', 'Bjork'])).done
    expect(calls[0]).toEqual({
      task: 'artist-groups',
      req: {
        system,
        schema,
        maxOutput,
        user: 'LIST\n1 Beatles | Beatles album\n2 Bjork | Bjork album\nCHECK\n1 Beatles | Beatles album\n2 Bjork | Bjork album'
      }
    })
    expect(maxOutput).toBe(8000)
  })

  it('makes no request when every name was asked', async () => {
    const { ai, calls } = fakeAi(both([]))
    const names = plain(['A', 'B'])
    const g = noGroups()
    g.asked = new Set(['a', 'b'])
    const j = job(ai, names, g)
    expect(await j.done).toEqual({ end: 'done', grouped: 0, asked: false })
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
                [3, 2],
                [4, 1]
              ],
              'm2'
            )
          : ok([
              [2, 3],
              [4, 5]
            ])
      )
      const j = job(ai, plain(['Bjork', 'Björk', 'Björk!', 'Beatles', 'The Beatles']))
      await j.done
      expect(calls.map((c) => c.avoid)).toEqual([undefined, ['m1']])
      expect(Object.fromEntries(j.groups.groups)).toEqual({ björk: 'Björk', 'björk!': 'Björk' })
    })

    it('keeps nothing of a chunk when no second model answers, and asks it again later', async () => {
      const { ai } = fakeAi((c) => (c.avoid ? { ok: false, error: 'failed' } : ok([[1, 2]])))
      const j = job(ai, plain(['Bjork', 'Björk']))
      expect(await j.done).toEqual({ end: 'failed' })
      expect(j.groups.groups.size).toBe(0)
      expect(j.groups.asked.size).toBe(0)
      expect(j.statuses.at(-1)).toEqual({ state: 'stopped', error: 'failed' })
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
      expect(await j.done).toMatchObject({ end: 'done', grouped: 3 })
      expect(Object.fromEntries(j.groups.groups)).toEqual({ n1: 'N2', n2: 'N2', n250: 'N2' })
    })

    it('joins a saved group and keeps its name', async () => {
      const g = noGroups()
      g.groups.set('bjork', 'Björk (saved)')
      g.asked.add('bjork')
      const { ai } = fakeAi(both([[2, 1]]))
      const j = job(ai, plain(['Bjork', 'Björk', 'BJÖRK'], [1, 9, 1]), g)
      await j.done
      expect(Object.fromEntries(j.groups.groups)).toEqual({
        bjork: 'Björk (saved)',
        björk: 'Björk (saved)'
      })
    })

    it('saves after each chunk, with more keys asked each time', async () => {
      const { ai } = fakeAi(both([[1, 2]]))
      const j = job(ai, plain(many(450)))
      await j.done
      expect(j.saves.map((s) => s.asked)).toEqual([200, 400, 450])
      expect(j.saves[0].groups).toEqual({ n1: 'N1', n2: 'N1' })
    })

    it('stopped in the middle, keeps what was saved and throws', async () => {
      const stop = new AbortController()
      const { ai } = fakeAi((c, i) => {
        // the first ask of the second chunk
        if (i === 2) stop.abort()
        return ok([[1, 2]], c.avoid ? 'm2' : 'm1')
      })
      const j = job(ai, plain(many(450)), noGroups(), stop.signal)
      await expect(j.done).rejects.toThrow()
      expect(j.groups.asked.size).toBe(200)
      expect(j.groups.groups.size).toBe(2)
      expect(j.saves).toHaveLength(1)
    })

    it('says how far it got, and how many names it grouped', async () => {
      const { ai } = fakeAi(both([[1, 2]]))
      const j = job(ai, plain(many(250)))
      await j.done
      expect(j.statuses).toEqual([
        { state: 'running', checked: 0, total: 250 },
        { state: 'running', checked: 200, total: 250 },
        { state: 'done', grouped: 2, at: 1000 }
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
      expect(j.groups.asked.size).toBe(0)
    })

    it('limit: stops and says when it goes on', async () => {
      const { ai } = fakeAi((c, i) =>
        i < 2 ? ok([], c.avoid ? 'm2' : 'm1') : { ok: false, error: 'limit', retryAt: 5000 }
      )
      const j = job(ai, plain(many(250)))
      expect(await j.done).toEqual({ end: 'limit', retryAt: 5000 })
      expect(j.groups.asked.size).toBe(200)
      expect(j.statuses.at(-1)).toEqual({ state: 'limit', at: 5000 })
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
        expect(j.groups.asked.size).toBe(0)
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
      expect(Object.fromEntries(j.groups.groups)).toEqual({ a: 'A', c: 'A', d: 'A' })
    })

    it('splits the LIST before asking when maxInput says it will not fit', async () => {
      const { ai, calls } = fakeAi(both([]), { max: 700 })
      await job(ai, plain(many(40))).done
      const lists = calls.map((c) => c.req.user.split('\nCHECK')[0].split('\n').length - 1)
      expect(lists.length).toBeGreaterThan(2)
      expect(lists.reduce((a, b) => a + b, 0)).toBe(40 * 2)
    })
  })
})
