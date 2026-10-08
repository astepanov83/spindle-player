import { afterEach, describe, expect, it, vi } from 'vitest'
import { filesActSetting, filesSettings, filesSoundLine } from './settings'
import { files } from './store.svelte'
import { ai } from '../../ai.svelte'
import { library } from '../../stores/library.svelte'
import { defaultPalettes } from '../../../../shared/palette'
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
    files.status = { ...files.status, groups: { state: 'done', joined: 1, split: 0, at: 0 } }
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
    files.status = { ...files.status, groups: { state: 'done', joined: 1, split: 0, at: 0 } }
    ai.state = state(true, false)
    const blocks = own()
    expect(blocks.at(-3)).toMatchObject({ kind: 'status' })
    expect(blocks.at(-2)).toMatchObject({ id: 'ai-recheck', disabled: true })
    expect(blocks.at(-1)).toEqual({ kind: 'status', text: 'Connect OpenRouter first.' })
  })

  it('asks before checking every name when an ask may cost money', () => {
    files.status = { ...files.status, groups: { state: 'done', joined: 1, split: 0, at: 0 } }
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

  it('offers to see the changes once the AI changed a name, and opens them', () => {
    files.status = { ...files.status, groups: { state: 'done', joined: 1, split: 0, at: 0 } }
    ai.state = state(true)
    expect(own().some((b) => b.kind === 'button' && b.id === 'ai-fixes')).toBe(false)
    const grouped = { artist: 'Abba', artistTag: 'ABBA!', grouped: true as const }
    files.load({
      albums: [
        {
          id: 'a',
          title: 'A',
          year: 1976,
          added: 0,
          palette: defaultPalettes,
          cover: '',
          coverLarge: '',
          trackIds: ['t'],
          ...grouped
        }
      ],
      tracks: [
        {
          id: 't',
          title: 'T',
          duration: 1,
          albumId: 'a',
          album: 'A',
          no: 1,
          disc: 1,
          codec: '',
          folder: 0,
          ...grouped
        }
      ],
      folders: [{ name: '/m', parent: -1 }]
    })
    expect(own()).toContainEqual({ kind: 'button', id: 'ai-fixes', label: 'See the changes' })
    filesActSetting('ai-fixes', 'press')
    expect(library.tab).toBe('artists')
    expect(library.page('artists')).toBe('name-fixes')
  })

  it('shows neither the line nor the button while switched off', () => {
    files.status = { ...files.status, groups: { state: 'done', joined: 1, split: 0, at: 0 } }
    ai.state = state(false)
    expect(own()).toEqual([])
  })
})

describe('the looks in Settings (ticket 095)', () => {
  const looks = (): SettingBlock[] => {
    const blocks = filesSettings()
    const at = blocks.findIndex((b) => b.kind === 'title' && b.text === 'Looks')
    return blocks.slice(at + 1, at + 4)
  }

  it('lists each view with its looks as segments, and a line for the one picked', () => {
    const [albums, artists, artistPage] = looks()
    expect(albums).toMatchObject({
      kind: 'choice',
      id: 'look-albums',
      label: 'Albums',
      value: 'grid',
      options: [
        { id: 'grid', label: 'Grid' },
        { id: 'list', label: 'List' }
      ],
      segments: true
    })
    expect(artists).toMatchObject({ label: 'Artists', value: 'grid' })
    expect(artists.kind === 'choice' && artists.options.map((o) => o.label)).toEqual([
      'Grid',
      'Shelves',
      'List'
    ])
    expect(artistPage).toMatchObject({ label: 'Artist page', value: 'sections' })
    expect(artistPage.kind === 'choice' && artistPage.about).toMatch(/Albums, Singles and EPs/)
  })

  it('changes the same setting as the switch in the title row', async () => {
    const { settings } = await import('../../stores/settings.svelte')
    filesActSetting('look-artists', 'set', 'shelves')
    expect(settings.viewLooks.artists).toBe('shelves')
    const artists = looks()[1]
    expect(artists).toMatchObject({ value: 'shelves' })
    expect(artists.kind === 'choice' && artists.about).toMatch(/scrolls sideways/)
    // a look that view doesn't have, or another action, changes nothing
    filesActSetting('look-artists', 'set', 'column')
    filesActSetting('look-artists', 'press')
    filesActSetting('look-songs', 'set', 'grid')
    expect(settings.viewLooks).toEqual({
      albums: 'grid',
      artists: 'shelves',
      artistPage: 'sections'
    })
  })
})

describe('filesSoundLine', () => {
  it('counts the songs read while it runs, and says nothing before or after', () => {
    const rest = { ...files.status, loudness: undefined }
    files.status = rest
    expect(filesSoundLine()).toBeUndefined()
    files.status = { ...rest, loudness: { done: 1240, total: 8000 } }
    expect(filesSoundLine()).toBe('Reading 1,240 of 8,000 songs')
    files.status = { ...rest, loudness: { done: 8000, total: 8000 } }
    expect(filesSoundLine()).toBeUndefined()
  })
})
