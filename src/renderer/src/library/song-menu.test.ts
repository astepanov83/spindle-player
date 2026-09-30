// The song menu's entries, with the queue faked.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MenuEntry, MenuItem } from '../stores/menu.svelte'

const fake = vi.hoisted(() => ({
  calls: [] as string[],
  items: ['a', 'b', 'c'],
  index: 1
}))

vi.mock('../stores/queue.svelte', () => ({
  queue: {
    get items() {
      return fake.items
    },
    get index() {
      return fake.index
    },
    playNext: (ids: string[], from = '') => fake.calls.push(`next ${ids} ${from}`),
    append: (ids: string[], from = '') => fake.calls.push(`add ${ids} ${from}`),
    remove: (i: number) => fake.calls.push(`remove ${i}`),
    playRowNext: (i: number) => fake.calls.push(`row next ${i}`)
  }
}))
vi.stubGlobal('window', { playlistsApi: { save: vi.fn() } })

const { playlistMenu, songMenu, sections } = await import('./song-menu')
const { playlists } = await import('../stores/playlists.svelte')

const labels = (entries: MenuEntry[]): string[] =>
  entries.map((e) => (e === 'line' ? '---' : 'heading' in e ? `# ${e.heading}` : e.label))
const pick = (entries: MenuEntry[], label: string): void =>
  (
    entries.find((e) => typeof e === 'object' && 'label' in e && e.label === label) as MenuItem
  ).run()

beforeEach(() => {
  fake.calls = []
  fake.items = ['a', 'b', 'c']
  fake.index = 1
  playlists.load([{ id: 'p1', name: 'Mix', trackIds: [] }])
})

describe('songMenu', () => {
  it('starts with the queue, then the playlists', () => {
    expect(labels(songMenu(['x']))).toEqual([
      'Play next',
      'Add to queue',
      '---',
      '# Add to playlist',
      'Mix',
      'New playlist'
    ])
  })

  it('hands the songs and their source to the queue', () => {
    const m = songMenu(['x', 'y'], { from: 'Blue Hours' })
    pick(m, 'Play next')
    pick(m, 'Add to queue')
    expect(fake.calls).toEqual(['next x,y Blue Hours', 'add x,y Blue Hours'])
  })

  it('a queue row can leave the queue or move up to play next', () => {
    const m = songMenu(['c'], { queueRow: 2 })
    expect(labels(m).slice(0, 3)).toEqual(['Remove from queue', 'Play next', '---'])
    pick(m, 'Remove from queue')
    pick(m, 'Play next')
    expect(fake.calls).toEqual(['remove 2', 'row next 2'])
  })

  it('the current song has no Play next', () => {
    expect(labels(songMenu(['b'], { queueRow: 1 })).slice(0, 2)).toEqual([
      'Remove from queue',
      '---'
    ])
  })

  it('does nothing to a queue row that moved away since the menu opened', () => {
    const m = songMenu(['c'], { queueRow: 2 })
    fake.items = ['c', 'a', 'b']
    pick(m, 'Remove from queue')
    pick(m, 'Play next')
    expect(fake.calls).toEqual([])
  })

  it('rows of a playlist can leave it, and it is not offered to add to', () => {
    playlists.load([
      { id: 'p1', name: 'Mix', trackIds: ['x'] },
      { id: 'p2', name: 'Other', trackIds: [] }
    ])
    const m = labels(songMenu(['x'], { inPlaylist: 'p1' }))
    expect(m).not.toContain('Mix')
    expect(m.at(-1)).toBe('Remove from this playlist')
    // the page's own menu: not offered, and nothing to remove
    const page = labels(songMenu(['x'], { onPlaylist: 'p1' }))
    expect(page).not.toContain('Mix')
    expect(page).not.toContain('Remove from this playlist')
  })
})

describe('playlistMenu', () => {
  it('is only the playlist part, for the "Add to playlist" buttons', () => {
    expect(labels(playlistMenu(['x']))).toEqual(['# Add to playlist', 'Mix', 'New playlist'])
    expect(labels(playlistMenu(['x'], { onPlaylist: 'p1' }))).toEqual([
      '# Add to playlist',
      'New playlist'
    ])
  })
})

describe('sections', () => {
  it('puts a line between parts and skips empty ones', () => {
    const a: MenuEntry[] = [{ label: 'A', run: () => {} }]
    const b: MenuEntry[] = [{ label: 'B', run: () => {} }]
    expect(labels(sections(a, [], b))).toEqual(['A', '---', 'B'])
  })
})
