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
    playNext: (ids: string[], link?: { plugin: string; page: string }) =>
      fake.calls.push(`next ${ids}` + (link ? ` ${link.plugin}:${link.page}` : '')),
    append: (ids: string[], link?: { plugin: string; page: string }) =>
      fake.calls.push(`add ${ids}` + (link ? ` ${link.plugin}:${link.page}` : '')),
    removeRows: (rows: number[]) => fake.calls.push(`remove ${rows}`),
    playRowsNext: (rows: number[]) => fake.calls.push(`row next ${rows}`)
  }
}))
// radio's page half hears main from the start
vi.stubGlobal('window', {
  playlistsApi: { save: vi.fn() },
  lovedApi: { set: vi.fn() },
  libraryApi: { songInfo: vi.fn(async () => undefined) },
  radioApi: { onTitle: () => () => {}, onLogo: () => () => {}, onCover: () => () => {} }
})

const { playlistMenu, songMenu, sections } = await import('./song-menu')
const { playlists } = await import('../stores/playlists.svelte')
const { library } = await import('../stores/library.svelte')
const { files } = await import('../plugins/files/store.svelte')
const { layout } = await import('../stores/layout.svelte')
const { settings } = await import('../stores/settings.svelte')
const { loved } = await import('../stores/loved.svelte')
const { songInfo } = await import('./song-info.svelte')

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
  loved.load({})
})

describe('songMenu', () => {
  it('starts with the queue, then the playlists', () => {
    expect(labels(songMenu(['files:x']))).toEqual([
      'Play next',
      'Add to queue',
      '---',
      'Love',
      '---',
      '# Add to playlist',
      'Mix',
      'New playlist'
    ])
  })

  it('hands the songs to the queue', () => {
    const m = songMenu(['files:x', 'files:y'])
    pick(m, 'Play next')
    pick(m, 'Add to queue')
    expect(fake.calls).toEqual(['next files:x,files:y', 'add files:x,files:y'])
  })

  it('hands their page to the queue, so its Play button pauses it (ticket 040)', () => {
    const m = songMenu(['files:x'], { link: queueLink('playlist', 'p1') })
    pick(m, 'Play next')
    pick(m, 'Add to queue')
    expect(fake.calls).toEqual(['next files:x core:playlist/p1', 'add files:x core:playlist/p1'])
  })

  it('a queue row can leave the queue or move up to play next', () => {
    const m = songMenu(['files:c'], { queueRows: [2] })
    expect(labels(m).slice(0, 3)).toEqual(['Remove from queue', 'Play next', '---'])
    pick(m, 'Remove from queue')
    pick(m, 'Play next')
    expect(fake.calls).toEqual(['remove 2', 'row next 2'])
  })

  it('several queue rows go or move up together', () => {
    const m = songMenu(['files:a', 'files:c'], { queueRows: [0, 2] })
    expect(labels(m).slice(0, 3)).toEqual(['Remove from queue', 'Play next', '---'])
    pick(m, 'Remove from queue')
    pick(m, 'Play next')
    expect(fake.calls).toEqual(['remove 0,2', 'row next 0,2'])
    // one of them moved away since: nothing happens
    fake.calls = []
    fake.items = ['files:a', 'files:b', 'files:x']
    pick(m, 'Remove from queue')
    expect(fake.calls).toEqual([])
  })

  it('the current song has no Play next', () => {
    expect(labels(songMenu(['files:b'], { queueRows: [1] })).slice(0, 2)).toEqual([
      'Remove from queue',
      '---'
    ])
  })

  it('does nothing to a queue row that moved away since the menu opened', () => {
    const m = songMenu(['files:c'], { queueRows: [2] })
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

const song = (artist: string, artists?: string[]): void => {
  const album = {
    id: 'al',
    title: 'Blue Hours',
    artist,
    year: 0,
    added: 0,
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
  files.load({ albums: [album], tracks: [track('s1'), track('s2')], folders: [] })
  library.go({ tab: 'radio' })
}

describe('Go to (ticket 040)', () => {
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
      'Love',
      '---',
      '# Add to playlist',
      'Mix',
      'New playlist',
      '---',
      'Song info'
    ])
    pick(m, 'Go to album')
    expect([library.tab, library.page('albums'), library.landing]).toEqual([
      'albums',
      'album/al',
      { song: 's2' }
    ])
    // the queue's drawer closes, so the page shows
    expect(layout.showQueue).toBe(false)
    pick(m, 'Go to artist')
    expect([library.tab, library.page('artists')]).toEqual(['artists', 'artist/marinavale'])
  })

  it('a split artist gives one item per artist', () => {
    song('A, B', ['A', 'B'])
    const m = songMenu(['files:s1'], { queueRows: [1] })
    expect(labels(m).slice(0, 6)).toEqual([
      'Remove from queue',
      '---',
      'Go to album',
      'Go to A',
      'Go to B',
      '---'
    ])
    pick(m, 'Go to B')
    expect(library.page('artists')).toBe('artist/b')
  })

  it('an MFP song goes to its episode, and not to an artist (ticket 052)', async () => {
    const { mfp } = await import('../plugins/mfp/store.svelte')
    const songs = [{ id: 'm1', title: 'M', artist: 'Marina Vale', start: 0, length: 1 }]
    mfp.load({
      episodes: [
        { id: 'ep', title: '01: Mixer', artist: 'Mixer', year: 0, link: '', length: 1, songs }
      ]
    })
    settings.plugins.mfp = true
    const m = songMenu(['mfp:m1'])
    expect(labels(m)).toContain('Go to album')
    expect(labels(m)).not.toContain('Go to artist')
    expect(labels(m)).not.toContain('Show in file manager')
    pick(m, 'Go to album')
    expect([library.tab, library.page('mfp'), library.landing]).toEqual([
      'mfp',
      'episode/ep',
      { song: 'm1' }
    ])
  })

  it('is left out for several songs, and where there is no library (Focus)', () => {
    song('Marina Vale')
    expect(labels(songMenu(['files:s1', 'files:s2']))).not.toContain('Go to album')
    fake.hasLibrary = false
    expect(labels(songMenu(['files:s1']))).not.toContain('Go to album')
  })
})

describe("the songs' plugin's entries", () => {
  const show = { label: 'Show in file manager', run: vi.fn() }

  it('come after Go to and before the playlists', () => {
    const entries = songMenu(['files:a', 'files:b'], { actions: [show] })
    expect(labels(entries).slice(0, 5)).toEqual([
      'Play next',
      'Add to queue',
      '---',
      'Show in file manager',
      '---'
    ])
    pick(entries, 'Show in file manager')
    expect(show.run).toHaveBeenCalledOnce()
  })

  it('are left out when the block gives none', () => {
    expect(labels(songMenu(['files:a']))).not.toContain('Show in file manager')
  })
})

describe('Love and Unlove (ticket 117)', () => {
  const near = (entries: MenuEntry[]): string[] => {
    const l = labels(entries)
    return l.slice(l.indexOf('Add to queue') + 2, l.indexOf('# Add to playlist') - 1)
  }

  it('one song: Love, then Unlove once it is loved', () => {
    const m = songMenu(['files:a'])
    expect(near(m)).toEqual(['Love'])
    pick(m, 'Love')
    expect(loved.has('files:a')).toBe(true)
    expect(window.lovedApi.set).toHaveBeenLastCalledWith(['files:a'], true)
    const again = songMenu(['files:a'])
    expect(near(again)).toEqual(['Unlove'])
    pick(again, 'Unlove')
    expect(loved.has('files:a')).toBe(false)
  })

  it('many songs: Love loves the rest, Unlove all of them; a mix offers both', () => {
    loved.load({ 'files:a': 5 })
    const m = songMenu(['files:a', 'files:b', 'files:c'])
    expect(near(m)).toEqual(['Love', 'Unlove'])
    pick(m, 'Love')
    // the first time stays
    expect(loved.all).toMatchObject({ 'files:a': 5, 'files:b': expect.any(Number) })
    expect(Object.keys(loved.all).sort()).toEqual(['files:a', 'files:b', 'files:c'])
    const all = songMenu(['files:a', 'files:b', 'files:c'])
    expect(near(all)).toEqual(['Unlove'])
    pick(all, 'Unlove')
    expect(loved.all).toEqual({})
  })

  it('songs that cannot be loved get none, and are left out of a mix', () => {
    expect(labels(songMenu(['radio:rb-1', 'mfp:e#1']))).not.toContain('Love')
    const m = songMenu(['mfp:e#1', 'files:a'])
    pick(m, 'Love')
    expect(loved.all).toEqual({ 'files:a': expect.any(Number) })
    expect(window.lovedApi.set).toHaveBeenLastCalledWith(['files:a'], true)
  })
})

describe('a list that fills itself (ticket 118)', () => {
  it('is read only: no Remove, never offered to add to; Unlove takes a song out of Loved', () => {
    loved.load({ 'files:a': 1 })
    const m = songMenu(['files:a'], { link: queueLink('smart', 'loved') })
    expect(labels(m)).not.toContain('Remove from this playlist')
    expect(labels(m)).not.toContain('Loved')
    expect(labels(m)).toContain('Unlove')
    pick(m, 'Play next')
    expect(fake.calls).toEqual(['next files:a core:smart/loved'])
    pick(m, 'Unlove')
    expect(loved.has('files:a')).toBe(false)
  })
})

describe('Song info (ticket 127)', () => {
  it('last, for one song of the library', async () => {
    song('Marina Vale')
    const m = songMenu(['files:s1'], { queueRows: [1] })
    expect(labels(m).slice(-2)).toEqual(['---', 'Song info'])
    pick(m, 'Song info')
    expect(songInfo.view?.title).toBe('s1')
    expect(window.libraryApi.songInfo).toHaveBeenCalledWith('s1')
    songInfo.close()
  })

  it('not for several songs, a song not in the library, or a station', () => {
    song('Marina Vale')
    expect(labels(songMenu(['files:s1', 'files:s2']))).not.toContain('Song info')
    expect(labels(songMenu(['files:gone']))).not.toContain('Song info')
    expect(labels(songMenu(['radio:rb-1']))).not.toContain('Song info')
  })
})
