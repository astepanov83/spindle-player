// The core's questions to plugins, answered by the files and mfp page halves
// from a small made-up library, and by radio's from My stations.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Album, LibraryData, MfpStatus, Track } from '../../../shared/library'
import { defaultPalettes } from '../../../shared/palette'
import type { Station } from '../../../shared/stations'

// radio's page half hears main from the start
vi.stubGlobal('window', {
  radioApi: { onTitle: () => () => {}, onLogo: () => () => {}, onCover: () => () => {} }
})

let p: typeof import('./index')
let library: typeof import('../stores/library.svelte').library
let settings: typeof import('../stores/settings.svelte').settings

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
  palette: defaultPalettes,
  cover: `cover-${id}`,
  coverLarge: '',
  trackIds,
  ...extra
})

// a files album, a disc image's two parts, and an MFP episode
function lib(): LibraryData {
  return {
    albums: [
      album('al', ['s1']),
      album('img', ['c1', 'c2']),
      album('ep', ['m1'], { online: 'mfp' })
    ],
    tracks: [
      track('s1', 'al'),
      track('c1', 'img', { part: { file: 'disc', start: 0, end: 100 } }),
      track('c2', 'img', { part: { file: 'disc', start: 100 } }),
      track('m1', 'ep', { online: 'mfp', folder: -1, artist: 'Mixer' })
    ],
    folders: [{ name: '/m', parent: -1 }]
  }
}

const mfpOn: MfpStatus = { episodes: 1, fetchedAt: 1, running: false }

beforeEach(async () => {
  vi.resetModules()
  p = await import('./index')
  library = (await import('../stores/library.svelte')).library
  settings = (await import('../stores/settings.svelte')).settings
  settings.plugins = { files: true, radio: true, mfp: true }
})

describe('itemInfo', () => {
  it('answers a song of the library from what it holds', () => {
    library.load(lib())
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
    library.load(lib())
    expect(p.itemInfo('files:s1')).toBe(p.itemInfo('files:s1'))
    settings.plugins.mfp = false
    expect(p.itemInfo('mfp:m1')).toBe(p.itemInfo('mfp:m2'))
  })

  it('says off for a plugin that is off, whatever its data', () => {
    library.load(lib())
    settings.plugins.mfp = false
    expect(p.itemInfo('mfp:m1')).toEqual({ state: 'off', text: 'MFP is off' })
    expect(p.infoOf('mfp:m1')).toBeUndefined()
    expect(p.playItem('mfp:m1')).toBeUndefined()
  })

  it('a song is loading until the first library, then gone if not in it', () => {
    expect(p.itemInfo('files:s1').state).toBe('loading')
    library.load(lib())
    expect(p.itemInfo('files:s1').state).toBe('ok')
    expect(p.itemInfo('files:nope').state).toBe('missing')
  })

  it('an MFP song is loading until main says MFP is on and its episodes are in', () => {
    library.load({ ...lib(), albums: lib().albums.slice(0, 2), tracks: lib().tracks.slice(0, 3) })
    // the library has no episodes yet: MFP was just turned on
    expect(p.itemInfo('mfp:m1').state).toBe('loading')
    library.status = { ...library.status, mfp: mfpOn }
    expect(p.itemInfo('mfp:m1').state).toBe('loading')
    library.load(lib())
    expect(p.itemInfo('mfp:m1').state).toBe('ok')
    expect(p.itemInfo('mfp:gone').state).toBe('missing')
  })

  it("a key of one plugin is not another plugin's song", () => {
    library.load(lib())
    library.status = { ...library.status, mfp: mfpOn }
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
    library.load(lib())
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
})

describe('links', () => {
  it('lead to the album at the song and to the artist', () => {
    library.load(lib())
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
    library.load(lib())
    library.status = { ...library.status, mfp: mfpOn }
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
    library.load(lib())
    p.openPage({ plugin: 'mfp', page: 'episode/ep' })
    expect([library.tab, library.page('mfp')]).toEqual(['mfp', 'episode/ep'])
    p.openPage({ plugin: 'radio', page: '' })
    expect(library.tab).toBe('radio')
    // a files link to an episode is no page of files
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
    library.load(lib())
    const tab = (id: string): ReturnType<typeof p.pluginTabs>[number] =>
      p.pluginTabs().find((t) => t.id === id)!
    expect(p.pageBlocks(tab('albums')).map((b) => b.kind)).toEqual(['head', 'tiles'])
    library.query = 'vale'
    expect(p.pageBlocks(tab('albums')).map((b) => b.kind)).toEqual(['results'])
    expect(p.pageBlocks(tab('radio'))).toEqual([{ kind: 'view', view: 'radio' }])
    expect(p.pageBlocks(tab('playlists'))).toEqual([])
  })

  it('fill the search results with the groups of each plugin that is on', () => {
    library.load(lib())
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
    library.load(lib())
    library.query = 'song'
    expect(p.pagePath('albums')).toEqual(['search'])
    library.showAll('files:songs')
    expect(p.pagePath('albums')).toEqual(['search', 'all:files:songs'])
  })

  it('open a tile in its tab as a step, or as a link in the tab that shows it', () => {
    library.load(lib())
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
    library.load(lib())
    library.pickTab('folders')
    library.query = 'song'
    p.openFrom('folders', { plugin: 'files', page: 'folder/x' }, true)
    expect([library.page('folders'), library.query]).toEqual(['folder/x', 'song'])
  })

  it('pass a block action to its plugin, not while it is off', () => {
    library.load(lib())
    p.actOnPage('files', 'songs', 'sort', 't')
    expect(library.sort).toEqual({ k: 't', dir: 1 })
    settings.plugins.files = false
    p.actOnPage('files', 'songs', 'sort', 't')
    expect(library.sort).toEqual({ k: 't', dir: 1 })
  })

  it("give the core's Playlists the empty library while there are no songs", () => {
    expect(p.playlistsEmpty(true)).toMatchObject({ plugin: 'files', block: { kind: 'empty' } })
    library.load(lib())
    expect(p.playlistsEmpty(true)).toBeUndefined()
  })
})

describe('itemsVersion', () => {
  it('changes with a plugin turned on or off, and with new data', () => {
    library.load(lib())
    const a = p.itemsVersion()
    settings.plugins.mfp = false
    const b = p.itemsVersion()
    expect(b).not.toBe(a)
    library.load(lib())
    expect(p.itemsVersion()).not.toBe(b)
  })

  it("stays the same for a scan's status that changes no answer", () => {
    library.load(lib())
    library.status = { ...library.status, mfp: mfpOn }
    const a = p.itemsVersion()
    library.status = { ...library.status, done: 5, total: 10 }
    library.status = { ...library.status, mfp: { ...mfpOn, running: true } }
    expect(p.itemsVersion()).toBe(a)
  })
})
