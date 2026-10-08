// The core's questions to plugins, answered by the files and mfp page halves
// from a small made-up library, and by radio's from My stations.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Album, LibraryData, Track } from '../../../shared/library'
import type { MfpEpisodes, MfpStatus } from '../../../shared/plugins/mfp/mfp'
import { defaultPalettes } from '../../../shared/palette'
import type { Station } from '../../../shared/plugins/radio/stations'

// radio's page half hears main from the start
vi.stubGlobal('window', {
  radioApi: { onTitle: () => () => {}, onLogo: () => () => {}, onCover: () => () => {} }
})

let p: typeof import('./index')
let library: typeof import('../stores/library.svelte').library
let files: typeof import('./files/store.svelte').files
let settings: typeof import('../stores/settings.svelte').settings
let mfp: typeof import('./mfp/store.svelte').mfp

const track = (id: string, albumId: string, extra: Partial<Track> = {}): Track => ({
  id,
  title: `Song ${id}`,
  duration: 100,
  albumId,
  artist: 'Marina Vale',
  album: `Album ${albumId}`,
  no: 1,
  disc: 1,
  codec: 'FLAC',
  folder: 0,
  ...extra
})

const album = (id: string, trackIds: string[], extra: Partial<Album> = {}): Album => ({
  id,
  title: `Album ${id}`,
  artist: 'Marina Vale',
  year: 0,
  added: 0,
  palette: defaultPalettes,
  cover: `cover-${id}`,
  coverLarge: '',
  trackIds,
  ...extra
})

// a files album and a disc image's two parts
function lib(): LibraryData {
  return {
    albums: [album('al', ['s1']), album('img', ['c1', 'c2'])],
    tracks: [
      track('s1', 'al'),
      track('c1', 'img', { part: { file: 'disc', start: 0, end: 100 } }),
      track('c2', 'img', { part: { file: 'disc', start: 100 } })
    ],
    folders: [{ name: '/m', parent: -1 }]
  }
}

// an MFP episode of one song, as main sends it
const mixes = (): MfpEpisodes => ({
  episodes: [
    {
      id: 'ep',
      title: '1: Mixer',
      artist: 'Mixer',
      year: 2020,
      link: 'https://musicforprogramming.net/one',
      length: 100,
      songs: [{ id: 'm1', title: 'Song m1', artist: 'Mixer', start: 0, length: 100 }]
    }
  ]
})

const mfpOn: MfpStatus = { episodes: 1, fetchedAt: 1, running: false }

// main said MFP is on, with its episodes
function loadMfp(): void {
  mfp.load(mixes())
  mfp.status = mfpOn
}

beforeEach(async () => {
  vi.resetModules()
  p = await import('./index')
  library = (await import('../stores/library.svelte')).library
  files = (await import('./files/store.svelte')).files
  settings = (await import('../stores/settings.svelte')).settings
  mfp = (await import('./mfp/store.svelte')).mfp
  settings.plugins = { files: true, radio: true, mfp: true }
})

describe('itemInfo', () => {
  it('answers a song of the library from what it holds', () => {
    files.load(lib())
    const s = p.itemInfo('files:s1')
    expect(s.state).toBe('ok')
    if (s.state !== 'ok') return
    expect([s.info.title, s.info.subtitle, s.info.group, s.info.length]).toEqual([
      'Song s1',
      'Marina Vale',
      'Album al',
      100
    ])
    expect(s.info.art?.cover).toBe('cover-al')
  })

  it('gives the same answer each time, with no new objects', () => {
    files.load(lib())
    expect(p.itemInfo('files:s1')).toBe(p.itemInfo('files:s1'))
    settings.plugins.mfp = false
    expect(p.itemInfo('mfp:m1')).toBe(p.itemInfo('mfp:m2'))
  })

  it('says off for a plugin that is off, whatever its data', () => {
    files.load(lib())
    settings.plugins.mfp = false
    expect(p.itemInfo('mfp:m1')).toEqual({ state: 'off', text: 'MFP is off' })
    expect(p.infoOf('mfp:m1')).toBeUndefined()
    expect(p.playItem('mfp:m1')).toBeUndefined()
  })

  it('a song is loading until the first library, then gone if not in it', () => {
    expect(p.itemInfo('files:s1').state).toBe('loading')
    files.load(lib())
    expect(p.itemInfo('files:s1').state).toBe('ok')
    expect(p.itemInfo('files:nope').state).toBe('missing')
  })

  it('a song is loading while the first scan of an empty index runs, gone once it ended', () => {
    const empty = { albums: [], tracks: [], folders: [] }
    files.load({ ...empty, epoch: 'e', n: 0, partial: true })
    expect(p.itemInfo('files:s1').state).toBe('loading')
    // the scan sent its songs, then ended with a patch that drops the mark
    const patch = { patch: true as const, epoch: 'e', albums: [], goneTracks: [] }
    files.patch({ ...patch, from: 0, n: 1, tracks: [track('s1', 'al')], partial: true })
    expect(p.itemInfo('files:nope').state).toBe('loading')
    files.patch({ ...patch, from: 1, n: 2, tracks: [] })
    expect(p.itemInfo('files:s1').state).toBe('ok')
    expect(p.itemInfo('files:nope').state).toBe('missing')
  })

  it('an MFP song is loading until main says MFP is on and its episodes are in', () => {
    // no episodes yet: MFP was just turned on
    expect(p.itemInfo('mfp:m1').state).toBe('loading')
    mfp.status = mfpOn
    expect(p.itemInfo('mfp:m1').state).toBe('loading')
    mfp.load(mixes())
    expect(p.itemInfo('mfp:m1').state).toBe('ok')
    expect(p.itemInfo('mfp:gone').state).toBe('missing')
  })

  it('answers an MFP song from its episode, with no music library', () => {
    settings.plugins.files = false
    loadMfp()
    const s = p.itemInfo('mfp:m1')
    expect(
      s.state === 'ok' && [s.info.title, s.info.subtitle, s.info.group, s.info.length]
    ).toEqual(['Song m1', 'Mixer', '1: Mixer', 100])
    expect(s.state === 'ok' && s.info.names).toEqual([{ name: 'Mixer' }])
    // no picture yet: colors of its own
    expect(s.state === 'ok' && s.info.art?.cover).toBe('')
    expect(p.itemInfo('mfp:m1')).toBe(s)
  })

  it("a key of one plugin is not another plugin's song", () => {
    files.load(lib())
    loadMfp()
    expect(p.itemInfo('mfp:s1').state).toBe('missing')
    expect(p.itemInfo('files:m1').state).toBe('missing')
  })

  it('a station waits for My stations, then is one of them or gone (ticket 057)', async () => {
    const { radio } = await import('./radio/store.svelte')
    expect(p.itemInfo('radio:x').state).toBe('loading')
    const drone: Station = { id: 'x', name: 'Drone', tags: ['ambient'], streams: [] }
    radio.load([drone])
    const s = p.itemInfo('radio:x')
    expect(s.state === 'ok' && [s.info.title, s.info.subtitle]).toEqual(['Drone', 'ambient'])
    expect(s.state === 'ok' && s.info.titleTo).toEqual({ plugin: 'radio', page: '' })
    expect(p.itemInfo('radio:y').state).toBe('missing')
    expect(p.isLive('radio:x')).toBe(true)
    expect(p.isLive('files:s1')).toBe(false)
    expect(p.liveOf('radio:x')?.id).toBe('x')
    // a station is not played from the track queue
    expect(p.playItem('radio:x')).toBeUndefined()
    settings.plugins.radio = false
    expect(p.itemInfo('radio:x')).toEqual({ state: 'off', text: 'Radio is off' })
    // off, it can still be stopped
    expect(p.liveOf('radio:x')).toBeDefined()
  })
})

describe('actOn (ticket 058)', () => {
  it('passes a bar action to the item’s plugin, not while it is off', async () => {
    const { radio } = await import('./radio/store.svelte')
    const drone: Station = { id: 'x', name: 'Drone', tags: [], streams: [] }
    radio.load([])
    radio.station = drone
    const choose = vi.spyOn(radio, 'choose').mockImplementation(() => {})
    const save = vi.spyOn(radio, 'save').mockResolvedValue()
    p.actOn('radio:x', 'stream', '1')
    p.actOn('radio:x', 'save')
    expect(choose).toHaveBeenCalledWith(1)
    expect(save).toHaveBeenCalledOnce()
    // only the playing station's actions
    p.actOn('radio:y', 'save')
    settings.plugins.radio = false
    p.actOn('radio:x', 'save')
    expect(save).toHaveBeenCalledOnce()
    // a plugin with no actions
    expect(() => p.actOn('files:s1', 'like')).not.toThrow()
  })

  it('canOf and actionsOf: undefined for a plugin that says nothing more, or is off', () => {
    expect(p.canOf('files:s1')).toBeUndefined()
    expect(p.actionsOf('files:s1')).toBeUndefined()
    settings.plugins.files = false
    expect(p.actionsOf('files:s1')).toBeUndefined()
  })
})

describe('playItem', () => {
  it('gives the file and the part of a disc image, for the carry-on', () => {
    files.load(lib())
    expect(p.playItem('files:c1')).toEqual({
      url: 'spindle://media/disc',
      part: { file: 'disc', start: 0, end: 100 },
      length: 100,
      can: { seek: true, pause: true, next: true, previous: true },
      codec: 'FLAC'
    })
    expect(p.playItem('files:s1')).toMatchObject({ url: 'spindle://media/s1' })
    expect(p.playItem('files:nope')).toBeUndefined()
  })

  it("gives an MFP song as a stretch of its episode's mp3, which main serves", () => {
    const two = mixes()
    two.episodes[0].songs = [
      { id: 'm1', title: 'One', artist: 'A', start: 0, end: 50, length: 50 },
      { id: 'm2', title: 'Two', artist: 'B', start: 50, length: 50 }
    ]
    mfp.load(two)
    const url = 'spindle://mfp/ep'
    const can = { seek: true, pause: true, next: true, previous: true }
    expect(p.playItem('mfp:m1')).toEqual({
      url,
      part: { file: url, start: 0, end: 50 },
      length: 50,
      can,
      codec: 'MPEG 1 Layer 3'
    })
    // the next song starts where it ends, in the same file: the player carries on
    expect(p.playItem('mfp:m2')).toMatchObject({ url, part: { file: url, start: 50 } })
    expect(p.playItem('mfp:gone')).toBeUndefined()
  })
})

describe('links', () => {
  it('lead to the album at the song and to the artist', () => {
    files.load(lib())
    library.go({ tab: 'radio' })
    const i = p.infoOf('files:s1')!
    expect(i.links?.map((l) => l.label)).toEqual(['Go to album', 'Go to artist'])
    expect(i.names).toEqual([
      { name: 'Marina Vale', to: { plugin: 'files', page: 'artist/marinavale' } }
    ])
    p.openPage(i.titleTo!)
    expect([library.tab, library.page('albums'), library.landing]).toEqual([
      'albums',
      'album/al',
      { song: 's1' }
    ])
    p.openPage(i.names![0].to!)
    expect([library.tab, library.page('artists')]).toEqual(['artists', 'artist/marinavale'])
  })

  it("an MFP song's lead to its episode only", () => {
    loadMfp()
    const i = p.infoOf('mfp:m1')!
    expect(i.links).toEqual([
      { label: 'Go to album', to: { plugin: 'mfp', page: 'episode/ep', item: 'm1' } }
    ])
    expect(p.canOpen(i.groupTo!)).toBe(true)
    settings.plugins.mfp = false
    expect(p.canOpen(i.groupTo!)).toBe(false)
  })
})

describe('tabs', () => {
  const ids = (): string[] => p.pluginTabs().map((t) => t.id)

  it('come from the plugins that are on, with Playlists after the first one', () => {
    expect(ids()).toEqual(['songs', 'albums', 'artists', 'folders', 'playlists', 'radio', 'mfp'])
    settings.plugins.radio = false
    settings.plugins.mfp = false
    expect(ids()).toEqual(['songs', 'albums', 'artists', 'folders', 'playlists'])
    settings.plugins.files = false
    expect(ids()).toEqual([])
  })

  it('open a link in the tab that shows it', () => {
    files.load(lib())
    loadMfp()
    p.openPage({ plugin: 'mfp', page: 'episode/ep' })
    expect([library.tab, library.page('mfp')]).toEqual(['mfp', 'episode/ep'])
    p.openPage({ plugin: 'radio', page: '' })
    expect(library.tab).toBe('radio')
    // an episode is no page of files
    p.openPage({ plugin: 'files', page: 'album/ep' })
    expect(library.tab).toBe('radio')
    settings.plugins.radio = false
    p.openPage({ plugin: 'files', page: 'album/al' })
    p.openPage({ plugin: 'radio', page: '' })
    expect(library.tab).toBe('albums')
  })
})

describe('pages (ticket 059)', () => {
  beforeEach(() => {
    library.setTabs(p.navTabs())
    library.showIn('chips')
  })

  it('come from the plugin of the tab shown, with the search text', () => {
    files.load(lib())
    const tab = (id: string): ReturnType<typeof p.pluginTabs>[number] =>
      p.pluginTabs().find((t) => t.id === id)!
    expect(p.pageBlocks(tab('albums')).map((b) => b.kind)).toEqual(['head', 'tiles'])
    library.query = 'vale'
    expect(p.pageBlocks(tab('albums')).map((b) => b.kind)).toEqual(['results'])
    expect(p.pageBlocks(tab('radio')).map((b) => b.kind)).toEqual(['head', 'text', 'rows', 'empty'])
    expect(p.pageBlocks(tab('playlists'))).toEqual([])
  })

  it('fill the search results with the groups of each plugin that is on', () => {
    files.load(lib())
    loadMfp()
    const tab = p.pluginTabs().find((t) => t.id === 'albums')!
    library.query = ' song '
    const [b] = p.pageBlocks(tab)
    const groups = b.kind === 'results' ? b.groups : undefined
    expect(groups?.map((f) => [f.key, f.plugin, f.group.title])).toEqual([
      ['files:songs', 'files', 'Songs'],
      ['files:albums', 'files', 'Albums'],
      ['files:artists', 'files', 'Artists'],
      ['mfp:mixes', 'mfp', 'In MFP mixes']
    ])
    expect(groups?.[3].group).toMatchObject({ songs: ['mfp:m1'] })
    settings.plugins.mfp = false
    expect(p.searchGroups('song').map((f) => f.key)).toEqual([
      'files:songs',
      'files:albums',
      'files:artists'
    ])
    expect(p.searchGroups('  ')).toEqual([])
  })

  it('put a group shown whole under the results, for the scroll places', () => {
    files.load(lib())
    library.query = 'song'
    expect(p.pagePath('albums')).toEqual(['search'])
    library.showAll('files:songs')
    expect(p.pagePath('albums')).toEqual(['search', 'all:files:songs'])
  })

  it('open a tile in its tab as a step, or as a link in the tab that shows it', () => {
    files.load(lib())
    library.pickTab('artists')
    library.query = 'vale'
    p.openFrom('artists', { plugin: 'files', page: 'artist/marinavale' })
    expect([library.tab, library.page('artists'), library.query]).toEqual([
      'artists',
      'artist/marinavale',
      ''
    ])
    // an album opened from the artist stays under them
    p.openFrom('artists', { plugin: 'files', page: 'album/al/artist/marinavale' })
    expect(library.page('artists')).toBe('album/al/artist/marinavale')
    // the search results' artist, from Albums
    library.pickTab('albums')
    library.openPage('artists', '')
    library.pickTab('albums')
    p.openFrom('albums', { plugin: 'files', page: 'artist/marinavale' })
    expect([library.tab, library.page('artists'), library.landing]).toEqual([
      'artists',
      'artist/marinavale',
      { song: null }
    ])
  })

  it('keep the search text along a list it filters in place', () => {
    files.load(lib())
    library.pickTab('folders')
    library.query = 'song'
    p.openFrom('folders', { plugin: 'files', page: 'folder/x' }, true)
    expect([library.page('folders'), library.query]).toEqual(['folder/x', 'song'])
  })

  it('pass a block action to its plugin, not while it is off', () => {
    files.load(lib())
    p.actOnPage('files', 'songs', 'sort', 't')
    expect(library.sort).toEqual({ k: 't', dir: 1 })
    settings.plugins.files = false
    p.actOnPage('files', 'songs', 'sort', 't')
    expect(library.sort).toEqual({ k: 't', dir: 1 })
  })

  it("give the core's Playlists the empty library while there are no songs", () => {
    expect(p.playlistsEmpty(true)).toMatchObject({ plugin: 'files', block: { kind: 'empty' } })
    files.load(lib())
    expect(p.playlistsEmpty(true)).toBeUndefined()
  })
})

describe('itemsVersion', () => {
  it('changes with a plugin turned on or off, and with new data', () => {
    files.load(lib())
    const a = p.itemsVersion()
    settings.plugins.mfp = false
    const b = p.itemsVersion()
    expect(b).not.toBe(a)
    files.load(lib())
    expect(p.itemsVersion()).not.toBe(b)
    settings.plugins.mfp = true
    const c = p.itemsVersion()
    mfp.load(mixes())
    expect(p.itemsVersion()).not.toBe(c)
  })

  it('stays the same for a status that changes no answer', () => {
    files.load(lib())
    loadMfp()
    const a = p.itemsVersion()
    files.status = { ...files.status, done: 5, total: 10 }
    mfp.status = { ...mfpOn, running: true }
    expect(p.itemsVersion()).toBe(a)
  })
})

describe('settings blocks (ticket 060)', () => {
  const api = { addFolder: vi.fn(), removeFolder: vi.fn(), rescan: vi.fn() }
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockClear())
    vi.stubGlobal('window', { ...window, libraryApi: api })
  })

  it('give the music folders, Add folder, Rescan, the scan line, the looks and the AI task', () => {
    files.status = { ...files.status, folders: ['/m', '/gone'], missing: ['/gone'] }
    const blocks = p.settingBlocks('files')
    expect(blocks.map((b) => b.kind)).toEqual([
      'title',
      'list',
      'button',
      'button',
      'status',
      'title',
      'choice',
      'choice',
      'choice',
      'ai'
    ])
    expect(blocks[1]).toMatchObject({
      kind: 'list',
      rows: [
        { id: '/m', title: '/m' },
        { id: '/gone', title: '/gone', note: 'not found' }
      ],
      remove: 'Remove',
      confirm: 'Remove folder',
      disabled: false
    })
    expect(blocks[2]).toMatchObject({ id: 'add', disabled: false })
    expect(blocks[3]).toMatchObject({ id: 'rescan', disabled: false })
  })

  it('lock the folders and Rescan while settings.json is unreadable or a scan runs', () => {
    files.status = { ...files.status, folders: ['/m'], settingsUnreadable: true }
    let blocks = p.settingBlocks('files')
    expect(blocks[1]).toMatchObject({ disabled: true })
    expect(blocks[2]).toMatchObject({ disabled: true })
    expect(blocks[3]).toMatchObject({ disabled: true })
    files.status = { ...files.status, settingsUnreadable: false, phase: 'walk' }
    blocks = p.settingBlocks('files')
    expect(blocks[3]).toMatchObject({ id: 'rescan', disabled: true })
    expect(blocks[4]).toMatchObject({ kind: 'status', text: expect.stringContaining('Looking') })
  })

  it('send add, remove and Rescan to the plugin', () => {
    p.actOnSetting('files', 'add', 'press')
    p.actOnSetting('files', 'folders', 'remove', '/m')
    p.actOnSetting('files', 'rescan', 'press')
    expect(api.addFolder).toHaveBeenCalledTimes(1)
    expect(api.removeFolder).toHaveBeenCalledWith('/m')
    expect(api.rescan).toHaveBeenCalledTimes(1)
    // a remove with no row does nothing
    p.actOnSetting('files', 'folders', 'remove')
    expect(api.removeFolder).toHaveBeenCalledTimes(1)
  })

  it("give MFP's status line and its own button only while it is on, and Radio nothing", () => {
    expect(p.settingBlocks('mfp')).toEqual([])
    mfp.status = { ...mfpOn, running: true }
    expect(p.settingBlocks('mfp')).toEqual([
      { kind: 'status', text: '1 episode, looking for new ones…', busy: true },
      { kind: 'button', id: 'refresh', label: 'Check for new episodes', disabled: true }
    ])
    expect(p.settingBlocks('radio')).toEqual([])
    settings.plugins.mfp = false
    expect(p.settingBlocks('mfp')).toEqual([])
  })

  it("send MFP's button to main, not while it is off", () => {
    const refresh = vi.fn()
    vi.stubGlobal('window', { ...window, mfpApi: { refresh } })
    p.actOnSetting('mfp', 'refresh', 'press')
    expect(refresh).toHaveBeenCalledTimes(1)
    settings.plugins.mfp = false
    p.actOnSetting('mfp', 'refresh', 'press')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('do not act for a plugin that is off', () => {
    settings.plugins.files = false
    p.actOnSetting('files', 'add', 'press')
    expect(api.addFolder).not.toHaveBeenCalled()
  })
})

describe('"Show all" of a plugin that went off (ticket 060)', () => {
  it('is cleared with the tabs of that plugin', () => {
    library.setTabs(p.navTabs())
    library.showIn('chips')
    files.load(lib())
    loadMfp()
    library.query = 'song'
    library.showAll('mfp:mixes')
    expect(library.searchAll).toBe('mfp:mixes')
    settings.plugins.mfp = false
    library.setTabs(p.navTabs())
    expect(library.searchAll).toBeNull()
    // a group of a plugin still on stays
    library.showAll('files:songs')
    settings.plugins.radio = false
    library.setTabs(p.navTabs())
    expect(library.searchAll).toBe('files:songs')
  })
})

describe('typedIn (carried from ticket 062)', () => {
  it('gives the text to the plugin of the tab, not while it is off, and not for the core', async () => {
    const { radioHalf } = await import('./radio')
    const typed = vi.spyOn(radioHalf, 'typed')
    p.typedIn('radio', 'radio', 'metal', true)
    expect(typed).toHaveBeenCalledWith('radio', 'metal', true)
    typed.mockClear()
    p.typedIn('core', 'playlists', 'metal')
    expect(typed).not.toHaveBeenCalled()
    settings.plugins.radio = false
    p.typedIn('radio', 'radio', 'metal')
    expect(typed).not.toHaveBeenCalled()
  })
})

describe('music files turned off (ticket 063)', () => {
  const ids = (): string[] => p.pluginTabs().map((t) => t.id)

  it('takes its tabs and gives them back, and the library starts on the first tab on', () => {
    files.load(lib())
    settings.plugins.files = false
    expect(ids()).toEqual(['radio', 'playlists', 'mfp'])
    library.setTabs(p.navTabs())
    library.showIn('chips')
    expect(library.tab).toBe('radio')
    settings.plugins.files = true
    expect(ids()).toEqual(['songs', 'albums', 'artists', 'folders', 'playlists', 'radio', 'mfp'])
    // on again, its pages are there
    library.setTabs(p.navTabs())
    p.openPage({ plugin: 'files', page: 'album/al' })
    expect([library.tab, library.page('albums')]).toEqual(['albums', 'album/al'])
  })

  it('greys its songs out and keeps what it holds for when it is on again', () => {
    files.load(lib())
    settings.plugins.files = false
    expect(p.itemInfo('files:s1')).toEqual({ state: 'off', text: 'Music files are off' })
    expect(p.playItem('files:s1')).toBeUndefined()
    expect(p.searchGroups('song').map((g) => g.plugin)).not.toContain('files')
    settings.plugins.files = true
    expect(p.itemInfo('files:s1').state).toBe('ok')
  })

  it('shows no scan line, cover lookup lines or settings blocks while off', () => {
    files.load(lib())
    files.status = {
      ...files.status,
      phase: 'read',
      done: 1,
      total: 2,
      fetch: { running: true, found: 1, notFound: 0, left: 3, phase: 'covers' }
    }
    expect(p.statusLines()).toEqual(['Reading tags: 1 of 2'])
    expect(p.coverLines()).toEqual([
      { text: 'Looking up covers: found 1 of 4 · 3 left', busy: true }
    ])
    expect(p.settingBlocks('files').length).toBeGreaterThan(0)
    settings.plugins.files = false
    expect(p.statusLines()).toEqual([])
    expect(p.coverLines()).toEqual([])
    expect(p.settingBlocks('files')).toEqual([])
  })

  it('takes no files dropped on the window while off', async () => {
    const addDropped = vi.fn(async () => ({ added: [], known: 0, other: 1 }))
    Object.assign(window, { libraryApi: { addDropped } })
    const dropped = [new File([], 'music')]
    expect(p.takesDrops()).toBe(true)
    settings.plugins.files = false
    expect(p.takesDrops()).toBe(false)
    p.dropOn(dropped)
    expect(addDropped).not.toHaveBeenCalled()
    settings.plugins.files = true
    p.dropOn(dropped)
    expect(addDropped).toHaveBeenCalledWith(dropped)
  })
})
