import { describe, expect, it } from 'vitest'
import type { AiState } from '../../shared/ai'
import { aiBlocks, aiTarget } from './ai-blocks'

const info = {
  id: 'groups',
  name: 'Fix artist names',
  about:
    'Joint credits are split into their artists, and spellings of one artist are shown as one.',
  sends: 'Sends artist names to the service.'
}

const state = (over: Partial<AiState> = {}, on = true): AiState => ({
  providers: [{ id: 'a', name: 'Service A' }],
  provider: 'a',
  tasks: { groups: { info, on, ready: false } },
  blocks: [
    { kind: 'text', id: 'key', label: 'API key', secret: true },
    { kind: 'status', text: 'Not connected' }
  ],
  ...over
})

describe('aiBlocks', () => {
  it('draws nothing before the state comes or for a task main does not know', () => {
    expect(aiBlocks('groups', undefined)).toEqual([])
    expect(aiBlocks('other', state())).toEqual([])
  })

  it('draws only the switch while the task is off', () => {
    const out = aiBlocks('groups', state({}, false))
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      kind: 'switch',
      label: info.name,
      about: info.about,
      on: false
    })
  })

  it('draws the setup and what is sent while on', () => {
    const out = aiBlocks('groups', state())
    expect(out.map((b) => b.kind)).toEqual(['switch', 'text', 'status', 'status'])
    expect(out[3]).toEqual({ kind: 'status', text: info.sends })
  })

  it('has no service choice with one provider, and has one with two', () => {
    expect(aiBlocks('groups', state()).some((b) => b.kind === 'choice')).toBe(false)
    const two = state({
      providers: [
        { id: 'a', name: 'Service A' },
        { id: 'b', name: 'Service B' }
      ],
      provider: 'b'
    })
    const choice = aiBlocks('groups', two).find((b) => b.kind === 'choice')
    expect(choice).toMatchObject({
      label: 'Service',
      value: 'b',
      options: [
        { id: 'a', label: 'Service A' },
        { id: 'b', label: 'Service B' }
      ]
    })
  })

  it('gives each task its own ids, so two places do not clash', () => {
    const s = state()
    s.tasks.more = { info: { ...info, id: 'more' }, on: true, ready: false }
    const ids = (t: string): string[] => aiBlocks(t, s).flatMap((b) => ('id' in b ? [b.id] : []))
    expect(ids('groups').filter((id) => ids('more').includes(id))).toEqual([])
  })

  it('routes an act by the id the block was given', () => {
    const out = aiBlocks(
      'groups',
      state({
        providers: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' }
        ]
      })
    )
    const id = (kind: string): string => {
      const b = out.find((x) => x.kind === kind)
      return b && 'id' in b ? b.id : ''
    }
    expect(aiTarget(id('switch'))).toEqual({ to: 'task', task: 'groups' })
    expect(aiTarget(id('choice'))).toEqual({ to: 'provider-choice' })
    expect(aiTarget(id('text'))).toEqual({ to: 'provider', id: 'key' })
  })

  it('keeps a provider block id that holds slashes, and a task id that does', () => {
    const s = state({ blocks: [{ kind: 'button', id: 'a/b', label: 'Go' }] })
    s.tasks['x/y'] = { info: { ...info, id: 'x/y' }, on: true, ready: true }
    const btn = aiBlocks('x/y', s).find((b) => b.kind === 'button')
    expect(aiTarget(btn && 'id' in btn ? btn.id : '')).toEqual({ to: 'provider', id: 'a/b' })
    const sw = aiBlocks('x/y', s)[0]
    expect(aiTarget('id' in sw ? sw.id : '')).toEqual({ to: 'task', task: 'x/y' })
  })

  it('does not take a plugin block id for its own', () => {
    expect(aiTarget('folders')).toBeUndefined()
    expect(aiTarget('ai')).toBeUndefined()
  })
})
