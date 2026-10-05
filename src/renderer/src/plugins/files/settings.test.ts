import { describe, expect, it, vi } from 'vitest'
import { filesActSetting, filesSettings } from './settings'
import { files } from './store.svelte'
import { ai } from '../../ai.svelte'
import type { AiState } from '../../../../shared/ai'

const state = (on: boolean): AiState => ({
  providers: [],
  provider: 'p',
  tasks: {
    'artist-groups': {
      info: { id: 'artist-groups', name: 'Group', about: '', sends: '' },
      on,
      ready: on
    }
  },
  blocks: []
})

describe('filesSettings and the artist groups task', () => {
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
    vi.unstubAllGlobals()
  })

  it('shows no line while the task is off', () => {
    ai.state = state(false)
    expect(filesSettings().at(-1)).toEqual({ kind: 'ai', task: 'artist-groups' })
  })

  it('shows no button while the task is only switched on, not ready', () => {
    const s = state(true)
    ai.state = { ...s, tasks: { 'artist-groups': { ...s.tasks['artist-groups'], on: false } } }
    expect(filesSettings().some((b) => b.kind === 'button' && b.id === 'ai-recheck')).toBe(false)
  })
})
