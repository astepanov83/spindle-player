import { afterEach, describe, expect, it, vi } from 'vitest'
import { filesActSetting, filesSettings } from './settings'
import { files } from './store.svelte'
import { ai } from '../../ai.svelte'
import type { AiState } from '../../../../shared/ai'
import type { SettingBlock } from '../../../../shared/setting-blocks'

// the task's own blocks, in its box
const own = (): SettingBlock[] => {
  const b = filesSettings().find((b) => b.kind === 'ai')
  return b?.kind === 'ai' ? (b.blocks ?? []) : []
}

const state = (on: boolean, ready = on, paid = false): AiState => ({
  providers: [{ id: 'p', name: 'OpenRouter', about: '' }],
  provider: 'p',
  paid,
  tasks: {
    'artist-groups': {
      info: { id: 'artist-groups', name: 'Group', about: '', sends: '' },
      on,
      ready
    }
  },
  blocks: []
})

describe('filesSettings and the artist groups task', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('puts the ai block after the music folder blocks, with its line in it while on', () => {
    files.status = {
      ...files.status,
      groups: { state: 'running', step: 'join', checked: 600, total: 3000 }
    }
    ai.state = state(true)
    const blocks = filesSettings()
    const at = blocks.findIndex((b) => b.kind === 'ai')
    expect(at).toBe(blocks.length - 1)
    expect(blocks.slice(0, at).some((b) => b.kind === 'button' && b.id === 'rescan')).toBe(true)
    expect(blocks[at]).toEqual({
      kind: 'ai',
      task: 'artist-groups',
      blocks: [
        { kind: 'status', text: 'Matching spellings: 600 of 3,000', busy: true },
        { kind: 'button', id: 'ai-recheck', label: 'Check all names again', disabled: true }
      ]
    })
  })

  it('enables the button when no run is going, and sends the message when pressed', () => {
    files.status = { ...files.status, groups: { state: 'done', grouped: 1, at: 0 } }
    ai.state = state(true)
    expect(own().at(-1)).toMatchObject({ id: 'ai-recheck', disabled: false })
    const aiRecheck = vi.fn()
    vi.stubGlobal('window', { libraryApi: { aiRecheck } })
    filesActSetting('ai-recheck', 'press')
    expect(aiRecheck).toHaveBeenCalledOnce()
  })

  it('shows no line while the task is off', () => {
    ai.state = state(false)
    expect(filesSettings().at(-1)).toEqual({ kind: 'ai', task: 'artist-groups', blocks: [] })
  })

  it('keeps the line, and says why the button is disabled while switched on but not ready', () => {
    files.status = { ...files.status, groups: { state: 'done', grouped: 1, at: 0 } }
    ai.state = state(true, false)
    const blocks = own()
    expect(blocks.at(-3)).toMatchObject({ kind: 'status' })
    expect(blocks.at(-2)).toMatchObject({ id: 'ai-recheck', disabled: true })
    expect(blocks.at(-1)).toEqual({ kind: 'status', text: 'Connect OpenRouter first.' })
  })

  it('asks before checking every name when an ask may cost money', () => {
    files.status = { ...files.status, groups: { state: 'done', grouped: 1, at: 0 } }
    ai.state = state(true, true, false)
    expect(own().at(-1)).not.toHaveProperty('confirm')
    ai.state = state(true, true, true)
    expect(own().at(-1)).toMatchObject({
      id: 'ai-recheck',
      confirm: 'This asks about every artist again and may use credit.'
    })
  })

  it('names the service in an error line', () => {
    files.status = { ...files.status, groups: { state: 'stopped', error: 'network' } }
    ai.state = state(true)
    expect(own()[0]).toMatchObject({ text: expect.stringContaining('Could not reach OpenRouter') })
  })

  it('shows neither the line nor the button while switched off', () => {
    files.status = { ...files.status, groups: { state: 'done', grouped: 1, at: 0 } }
    ai.state = state(false)
    expect(own()).toEqual([])
  })
})
