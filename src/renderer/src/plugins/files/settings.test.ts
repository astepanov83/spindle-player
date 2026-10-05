import { afterEach, describe, expect, it, vi } from 'vitest'
import { filesActSetting, filesSettings } from './settings'
import { files } from './store.svelte'
import { ai } from '../../ai.svelte'
import type { AiState } from '../../../../shared/ai'

const state = (on: boolean, ready = on): AiState => ({
  providers: [],
  provider: 'p',
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

  it('puts the ai block after the music folder blocks, and its line after it while on', () => {
    files.status = {
      ...files.status,
      groups: { state: 'running', step: 'join', checked: 600, total: 3000 }
    }
    ai.state = state(true)
    const blocks = filesSettings()
    const at = blocks.findIndex((b) => b.kind === 'ai')
    expect(blocks[at]).toEqual({ kind: 'ai', task: 'artist-groups' })
    expect(blocks.slice(0, at).some((b) => b.kind === 'button' && b.id === 'rescan')).toBe(true)
    expect(blocks.slice(at + 1)).toEqual([
      { kind: 'status', text: 'Matching spellings: 600 of 3,000', busy: true },
      { kind: 'button', id: 'ai-recheck', label: 'Check all names again', disabled: true }
    ])
  })

  it('enables the button when no run is going, and sends the message when pressed', () => {
    files.status = { ...files.status, groups: { state: 'done', grouped: 1, at: 0 } }
    ai.state = state(true)
    expect(filesSettings().at(-1)).toMatchObject({ id: 'ai-recheck', disabled: false })
    const aiRecheck = vi.fn()
    vi.stubGlobal('window', { libraryApi: { aiRecheck } })
    filesActSetting('ai-recheck', 'press')
    expect(aiRecheck).toHaveBeenCalledOnce()
  })

  it('shows no line while the task is off', () => {
    ai.state = state(false)
    expect(filesSettings().at(-1)).toEqual({ kind: 'ai', task: 'artist-groups' })
  })

  it('keeps the line and shows the button disabled while switched on but not ready', () => {
    files.status = { ...files.status, groups: { state: 'done', grouped: 1, at: 0 } }
    ai.state = state(true, false)
    const blocks = filesSettings()
    expect(blocks.at(-2)).toMatchObject({ kind: 'status' })
    expect(blocks.at(-1)).toMatchObject({ id: 'ai-recheck', disabled: true })
  })

  it('shows neither the line nor the button while switched off', () => {
    files.status = { ...files.status, groups: { state: 'done', grouped: 1, at: 0 } }
    ai.state = state(false)
    expect(filesSettings().some((b) => b.kind === 'button' && b.id === 'ai-recheck')).toBe(false)
  })
})
