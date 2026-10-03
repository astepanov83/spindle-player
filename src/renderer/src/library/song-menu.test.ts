// The song menu's entries, with the queue faked.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queueLink } from '../../../shared/saved-queue'
import type { Track } from '../../../shared/library'
import { defaultPalettes } from '../../../shared/palette'
import type { MenuEntry, MenuItem } from '../stores/menu.svelte'

const fake = vi.hoisted(() => ({
  calls: [] as string[],
  items: ['files:a', 'files:b', 'files:c'],
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
    playNext: (ids: string[], from = '', link?: { plugin: string; page: string }) =>
      fake.calls.push(`next ${ids} ${from}` + (link ? ` ${link.plugin}:${link.page}` : '')),
    append: (ids: string[], from = '', link?: { plugin: string; page: string }) =>
      fake.calls.push(`add ${ids} ${from}` + (link ? ` ${link.plugin}:${link.page}` : '')),
    remove: (i: number) => fake.calls.push(`remove ${i}`),
    playRowNext: (i: number) => fake.calls.push(`row next ${i}`)
  }
}))
const showFolder = vi.fn(async (parts: string[]) => parts.length > 0)
// radio's page half hears main from the start
vi.stubGlobal('window', {
  playlistsApi: { save: vi.fn() },
  libraryApi: { showFolder },
  radioApi: { onTitle: () => () => {}, onLogo: () => () => {}, onCover: () => () => {} }
})

const { playlistMenu, songMenu, sections } = await import('./song-menu')
const { playlists } = await import('../stores/playlists.svelte')
const { library } = await import('../stores/library.svelte')
const { layout } = await import('../stores/layout.svelte')
const { notice } = await import('../stores/notice.svelte')
const { settings } = await import('../stores/settings.svelte')

const labels = (entries: MenuEntry[]): string[] =>
  entries.map((e) => (e === 'line' ? '---' : 'heading' in e ? `# ${e.heading}` : e.label))
const pick = (entries: MenuEntry[], label: string): void =>
  (
    entries.find((e) => typeof e === 'object' && 'label' in e && e.label === label) as MenuItem
  ).run()

beforeEach(() => {
  fake.calls = []
  fake.items = ['files:a', 'files:b', 'files:c']
  fake.index = 1
  fake.hasLibrary = true
  playlists.load([{ id: 'p1', name: 'Mix', items: [] }])
})

describe('songMenu', () => {
  it('starts with the queue, then the playlists', () => {
    expect(labels(songMenu(['files:x']))).toEqual([
      'Play next',
      'Add to queue',
      '---',
      '# Add to playlist',
      'Mix',
      'New playlist'
    ])
  })

  it('hands the songs and their source to the queue', () => {
    const m = songMenu(['files:x', 'files:y'], { from: 'Blue Hours' })
    pick(m, 'Play next')
    pick(m, 'Add to queue')
    expect(fake.calls).toEqual([
      'next files:x,files:y Blue Hours',
      'add files:x,files:y Blue Hours'
    ])
  })

  it('names where the songs come from, so "From" can open it (ticket 040)', () => {
    const m = songMenu(['files:x'], { from: 'Mix', link: queueLink('playlist', 'p1') })
    pick(m, 'Play next')
    pick(m, 'Add to queue')
    expect(fake.calls).toEqual([
      'next files:x Mix core:playlist/p1',
      'add files:x Mix core:playlist/p1'
    ])
  })

  it('a queue row can leave the queue or move up to play next', () => {
    const m = songMenu(['files:c'], { queueRow: 2 })
    expect(labels(m).slice(0, 3)).toEqual(['Remove from queue', 'Play next', '---'])
    pick(m, 'Remove from queue')
    pick(m, 'Play next')
    expect(fake.calls).toEqual(['remove 2', 'row next 2'])
  })

  it('the current song has no Play next', () => {
    expect(labels(songMenu(['files:b'], { queueRow: 1 })).slice(0, 2)).toEqual([
      'Remove from queue',
      '---'
    ])
  })

  it('does nothing to a queue row that moved away since the menu opened', () => {
    const m = songMenu(['files:c'], { queueRow: 2 })
    fake.items = ['files:c', 'files:a', 'files:b']
    pick(m, 'Remove from queue')
    pick(m, 'Play next')
    expect(fake.calls).toEqual([])
  })

  it('rows of a playlist can leave it, and it is not offered to add to', () => {
    playlists.load([
      { id: 'p1', name: 'Mix', items: ['files:x'] },
      { id: 'p2', name: 'Other', items: [] }
    ])
    const m = labels(songMenu(['files:x'], { inPlaylist: 'p1' }))
    expect(m).not.toContain('Mix')
    expect(m.at(-1)).toBe('Remove from this playlist')
    // the page's own menu: not offered, and nothing to remove
    const page = labels(songMenu(['files:x'], { onPlaylist: 'p1' }))
    expect(page).not.toContain('Mix')
    expect(page).not.toContain('Remove from this playlist')
  })
})

describe('playlistMenu', () => {
  it('is only the playlist part, for the "Add to playlist" buttons', () => {
    expect(labels(playlistMenu(['files:x']))).toEqual(['# Add to playlist', 'Mix', 'New playlist'])
    expect(labels(playlistMenu(['files:x'], { onPlaylist: 'p1' }))).toEqual([
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
    library.go({ chip: 'radio' })
  }

  it('one song goes to its album and its artist, between the queue and the playlists', () => {
    song('Marina Vale')
    const m = songMenu(['files:s2'])
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
    const m = songMenu(['files:s1'], { queueRow: 1 })
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

  it('an MFP song goes to its episode, and not to an artist (ticket 052)', () => {
    const base = {
      year: 0,
      palette: defaultPalettes,
      cover: '',
      coverLarge: ''
    }
    const t = (id: string, albumId: string, online?: 'mfp'): Track => ({
      id,
      title: id,
      duration: 1,
      albumId,
      artist: 'Marina Vale',
      album: albumId,
      no: 1,
      disc: 1,
      codec: '',
      folder: online ? -1 : 0,
      ...(online ? { online } : {})
    })
    library.load({
      albums: [
        { ...base, id: 'al', title: 'Blue Hours', artist: 'Marina Vale', trackIds: ['s1'] },
        { ...base, id: 'ep', title: '01: Mixer', artist: 'Mixer', trackIds: ['m1'], online: 'mfp' }
      ],
      tracks: [t('s1', 'al'), t('m1', 'ep', 'mfp')],
      folders: []
    })
    settings.plugins.mfp = true
    const m = songMenu(['mfp:m1'])
    expect(labels(m)).toContain('Go to album')
    expect(labels(m)).not.toContain('Go to artist')
    pick(m, 'Go to album')
    expect([library.chip, library.episode, library.landing]).toEqual(['mfp', 'ep', { song: 'm1' }])
  })

  it('is left out for several songs, and where there is no library (Focus)', () => {
    song('Marina Vale')
    expect(labels(songMenu(['files:s1', 'files:s2']))).not.toContain('Go to album')
    fake.hasLibrary = false
    expect(labels(songMenu(['files:s1']))).not.toContain('Go to album')
  })
})

describe('Show in file manager', () => {
  const folder = ['/home/me/Music', 'Rock', 'A']

  it('comes before the playlists when the songs have a folder', () => {
    const entries = songMenu(['files:a', 'files:b'], { folder })
    expect(labels(entries).slice(0, 5)).toEqual([
      'Play next',
      'Add to queue',
      '---',
      'Show in file manager',
      '---'
    ])
    pick(entries, 'Show in file manager')
    expect(showFolder).toHaveBeenLastCalledWith(folder)
  })

  it('is left out with no folder', () => {
    expect(labels(songMenu(['files:a']))).not.toContain('Show in file manager')
  })

  it('says so when the folder could not be opened', async () => {
    showFolder.mockResolvedValueOnce(false)
    pick(songMenu(['files:a'], { folder }), 'Show in file manager')
    await vi.waitFor(() => expect(notice.text).toBe("Couldn't open /home/me/Music/Rock/A"))
    notice.hide()
  })
})
