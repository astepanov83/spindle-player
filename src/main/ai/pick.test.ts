import { describe, expect, it, vi } from 'vitest'
import type { Answer } from '../../shared/ai'
import { askInTurn, biggestInput, maxTries, pickModels, requestSize } from './pick'
import type { ModelInfo } from './types'

const model = (
  id: string,
  json: ModelInfo['json'],
  context = 10000,
  maxOutput = 2000
): ModelInfo => ({
  id,
  name: id,
  context,
  maxOutput,
  json
})

const ids = (models: ModelInfo[]): string[] => models.map((m) => m.id)

describe('pickModels', () => {
  it('keeps models where the request and the answer fit', () => {
    const models = [model('small', 'schema', 1000), model('big', 'schema', 10000)]
    // 3000 in + 1000 out: too much for small
    expect(ids(pickModels(models, 3000, 1000))).toEqual(['big'])
    expect(ids(pickModels(models, 9000, 1000))).toEqual(['big'])
    expect(ids(pickModels(models, 9001, 1000))).toEqual([])
  })

  it("caps the answer by the model's own limit, so a lower one does not drop it", () => {
    const models = [model('short-answers', 'schema', 10000, 500), model('big', 'schema', 10000)]
    // 32000 out is more than either gives: each is asked for its own limit
    expect(ids(pickModels(models, 9500, 32000))).toEqual(['short-answers'])
    expect(ids(pickModels(models, 8000, 32000))).toEqual(['short-answers', 'big'])
  })

  it('puts schema models before prompt ones, each in the given order', () => {
    const models = [
      model('p1', 'prompt'),
      model('s1', 'schema'),
      model('p2', 'prompt'),
      model('s2', 'schema')
    ]
    expect(ids(pickModels(models, 100, 100))).toEqual(['s1', 's2', 'p1', 'p2'])
  })

  it('drops avoided models', () => {
    const models = [model('a', 'schema'), model('b', 'schema')]
    expect(ids(pickModels(models, 100, 100, ['a']))).toEqual(['b'])
  })
})

describe('size', () => {
  it('counts a token per three characters of system and user', () => {
    expect(requestSize({ system: 'abcd', user: 'abc', schema: {}, maxOutput: 10 })).toBe(3)
  })

  it('gives the biggest request a model takes with that answer', () => {
    const models = [model('a', 'schema', 8000, 1000), model('b', 'prompt', 20000, 500)]
    expect(biggestInput(models, 500)).toBe(19500)
    // b gives 500 out at most, so it still takes 19500 in
    expect(biggestInput(models, 1000)).toBe(19500)
    expect(biggestInput(models, 32000)).toBe(19500)
    expect(biggestInput([model('a', 'schema', 8000, 1000)], 32000)).toBe(7000)
    expect(biggestInput([], 500)).toBeUndefined()
  })
})

describe('askInTurn', () => {
  const models = ['a', 'b', 'c', 'd'].map((id) => model(id, 'schema'))
  const signal = new AbortController().signal

  it('goes on after failed, up to three models', async () => {
    const ask = vi.fn(async (): Promise<Answer> => ({ ok: false, error: 'failed' }))
    expect(await askInTurn(models, ask, signal)).toEqual({ ok: false, error: 'failed' })
    expect(ask).toHaveBeenCalledTimes(maxTries)
    expect(maxTries).toBe(3)
  })

  it('stops at the first answer', async () => {
    const ask = vi.fn(async (m: ModelInfo): Promise<Answer> =>
      m.id === 'b' ? { ok: true, json: 1, model: 'b' } : { ok: false, error: 'failed' }
    )
    expect(await askInTurn(models, ask, signal)).toEqual({ ok: true, json: 1, model: 'b' })
    expect(ask).toHaveBeenCalledTimes(2)
  })

  it.each(['auth', 'limit', 'network'] as const)(
    'does not try another model on %s',
    async (error) => {
      const ask = vi.fn(async (): Promise<Answer> => ({ ok: false, error, retryAt: 5 }))
      expect(await askInTurn(models, ask, signal)).toEqual({ ok: false, error, retryAt: 5 })
      expect(ask).toHaveBeenCalledTimes(1)
    }
  )

  it('stops when aborted', async () => {
    const c = new AbortController()
    const ask = vi.fn(async (): Promise<Answer> => {
      c.abort()
      return { ok: false, error: 'failed' }
    })
    await expect(askInTurn(models, ask, c.signal)).rejects.toThrow()
    expect(ask).toHaveBeenCalledTimes(1)
  })
})
