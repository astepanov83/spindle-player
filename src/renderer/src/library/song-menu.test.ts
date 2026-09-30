// The song menu's entries, with the queue faked.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Track } from '../../../shared/library'
import { defaultPalettes } from '../../../shared/palette'
import type { MenuEntry, MenuItem } from '../stores/menu.svelte'

const fake = vi.hoisted(() => ({
  calls: [] as string[],
  items: ['a', 'b', 'c'],
  index: 1,
  hasLibrary: true
}))

vi.mock('../stores/layout.svelte', () => ({
  layout: {
    get hasLibrary() {
      return fake.hasLibrary
    },
    showQueue: true
  }
}))

vi.mock('../stores/queue.svelte', () => ({
  queue: {
    get items() {
      return fake.items
    },
    get index() {
      return fake.index
    },
    playNext: (ids: string[], from = '', link?: { kind: string; id: string }) =>
      fake.calls.push(`next ${ids} ${from}` + (link ? ` ${link.kind}:${link.id}` : '')),
    append: (ids: string[], from = '', link?: { kind: string; id: string }) =>
      fake.calls.push(`add ${ids} ${from}` + (link ? ` ${link.kind}:${link.id}` : '')),
    remove: (i: number) => fake.calls.push(`remove ${i}`),
    playRowNext: (i: number) => fake.calls.push(`row next ${i}`)
  }
}))
vi.stubGlobal('window', { playlistsApi: { save: vi.fn() } })

const { playlistMenu, songMenu, sections } = await import('./song-menu')
const { playlists } = await import('../stores/playlists.svelte')
const { library } = await import('../stores/library.svelte')
const { layout } = await import('../stores/layout.svelte')

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
  fake.hasLibrary = true
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

  it('names where the songs come from, so "From" can open it (ticket 040)', () => {
    const m = songMenu(['x'], { from: 'Mix', link: { kind: 'playlist', id: 'p1' } })
    pick(m, 'Play next')
    pick(m, 'Add to queue')
    expect(fake.calls).toEqual(['next x Mix playlist:p1', 'add x Mix playlist:p1'])
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

describe('Go to (ticket 040)', () => {
  const song = (artist: string, artists?: string[]): void => {
    const album = {
      id: 'al',
      title: 'Blue Hours',
      artist,
      year: 0,
      palette: defaultPalettes,
      cover: '',
      coverLarge: '',
      trackIds: ['s1', 's2']
    }
    const track = (id: string): Track => ({
      id,
      title: id,
      duration: 1,
      albumId: 'al',
      artist,
      ...(artists ? { artists, artistTag: artist } : {}),
      album: 'Blue Hours',
      no: 1,
      disc: 1,
      codec: '',
      folder: 0
    })
    library.load({ albums: [album], tracks: [track('s1'), track('s2')], folders: [] })
    library.chip = 'radio'
  }

  it('one song goes to its album and its artist, between the queue and the playlists', () => {
    song('Marina Vale')
    const m = songMenu(['s2'])
    expect(labels(m)).toEqual([
      'Play next',
      'Add to queue',
      '---',
      'Go to album',
      'Go to artist',
      '---',
      '# Add to playlist',
      'Mix',
      'New playlist'
    ])
    pick(m, 'Go to album')
    expect([library.chip, library.open, library.landing]).toEqual(['albums', 'al', { song: 's2' }])
    // the queue's drawer closes, so the page shows
    expect(layout.showQueue).toBe(false)
    pick(m, 'Go to artist')
    expect([library.chip, library.artist]).toEqual(['artists', 'marinavale'])
  })

  it('a split artist gives one item per artist', () => {
    song('A, B', ['A', 'B'])
    const m = songMenu(['s1'], { queueRow: 1 })
    expect(labels(m).slice(0, 6)).toEqual([
      'Remove from queue',
      '---',
      'Go to album',
      'Go to A',
      'Go to B',
      '---'
    ])
    pick(m, 'Go to B')
    expect(library.artist).toBe('b')
  })

  it('is left out for several songs, and where there is no library (Focus)', () => {
    song('Marina Vale')
    expect(labels(songMenu(['s1', 's2']))).not.toContain('Go to album')
    fake.hasLibrary = false
    expect(labels(songMenu(['s1']))).not.toContain('Go to album')
  })
})
