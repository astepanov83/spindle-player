import { describe, expect, it } from 'vitest'
import {
  defaultSettings,
  isKnownSettingsFile,
  pageSettings,
  parseStoredSettings,
  type StoredSettings
} from './settings'

const defaults = {
  ...defaultSettings(),
  windowSizes: {},
  windowMaximized: {},
  windowPlace: null,
  folders: [],
  ai: { provider: 'openrouter', tasks: {}, providers: {} }
}

describe('parseStoredSettings', () => {
  it('gives the defaults for no file or a file that is not an object', () => {
    for (const raw of [undefined, null, 42, 'studio', [], true]) {
      expect(parseStoredSettings(raw)).toEqual(defaults)
    }
  })

  it('keeps a good file as it is', () => {
    const good = {
      template: 'focus',
      queue: { studio: 'col', classic: 'col', focus: 'drawer' },
      visualizer: 'wave',
      theme: 'light',
      volume: 35,
      fetchCovers: true,
      coverSources: { musicbrainz: false, deezer: true, itunes: true },
      closeAction: 'minimize',
      plugins: { files: true, radio: false, mfp: true },
      viewSorts: { albums: 'added' },
      artistsShown: 'all',
      viewLooks: { albums: 'list', artists: 'shelves', artistPage: 'column' },
      loudness: 'song',
      noCover: 'type',
      windowSizes: { focus: { width: 500, height: 700 }, studio: { width: 1300, height: 800 } },
      windowMaximized: { studio: true, focus: false },
      windowPlace: { x: -1200, y: 40 },
      folders: ['/home/me/Music', '/mnt/nas/music'],
      ai: { provider: 'other', tasks: { a: true, b: false }, providers: { other: { model: 'x' } } }
    }
    expect(parseStoredSettings(good)).toEqual(good)
  })

  it('replaces only the wrong fields', () => {
    const s = parseStoredSettings({
      template: 'mini',
      queue: { studio: 'col', classic: 'tab', focus: 7 },
      visualizer: 'spectrum',
      theme: 'blue'
    })
    expect(s.template).toBe('studio')
    // Classic does not offer Tab, so it gets its default
    expect(s.queue).toEqual({ studio: 'col', classic: 'drawer', focus: 'tab' })
    expect(s.visualizer).toBe('spectrum')
    expect(s.theme).toBe('system')
  })

  it('fills in a missing queue entry and ignores unknown keys', () => {
    const s = parseStoredSettings({ queue: { focus: 'drawer', mini: 'tab' }, extra: 1 })
    expect(s.queue).toEqual({ studio: 'tab', classic: 'drawer', focus: 'drawer' })
    expect(s).not.toHaveProperty('extra')
  })

  it('drops broken window sizes and keeps good ones', () => {
    const s = parseStoredSettings({
      windowSizes: {
        studio: { width: '1200', height: 700 },
        classic: { width: NaN, height: 700 },
        focus: { width: 450.6, height: 690.2 },
        mini: { width: 300, height: 300 }
      }
    })
    expect(s.windowSizes).toEqual({ focus: { width: 451, height: 690 } })
  })

  it('raises a window size below the template minimum and caps a huge one', () => {
    const s = parseStoredSettings({
      windowSizes: { focus: { width: 100, height: 100 }, studio: { width: 1e9, height: 600 } }
    })
    expect(s.windowSizes.focus).toEqual({ width: 380, height: 560 })
    expect(s.windowSizes.studio).toEqual({ width: 16384, height: 600 })
  })

  it('treats a windowSizes that is not an object as empty', () => {
    expect(parseStoredSettings({ windowSizes: [1, 2] }).windowSizes).toEqual({})
  })

  it('keeps only absolute folder paths, each once, without a trailing slash', () => {
    const s = parseStoredSettings({
      folders: ['/music/', 'relative/path', '', 7, '/music', 'C:\\Music\\', '/', '/a//']
    })
    expect(s.folders).toEqual(['/music', 'C:\\Music', '/', '/a'])
  })

  it('keeps the volume between 0 and 100, as a whole number', () => {
    expect(parseStoredSettings({ volume: 42.4 }).volume).toBe(42)
    expect(parseStoredSettings({ volume: -5 }).volume).toBe(0)
    expect(parseStoredSettings({ volume: 250 }).volume).toBe(100)
    expect(parseStoredSettings({ volume: '50' }).volume).toBe(70)
    expect(parseStoredSettings({ volume: NaN }).volume).toBe(70)
  })

  it('treats folders that are not a list as none', () => {
    expect(parseStoredSettings({ folders: '/music' }).folders).toEqual([])
  })
})

describe('pageSettings', () => {
  it('leaves out window sizes and folders, and copies the queue', () => {
    const stored = parseStoredSettings({
      windowSizes: { focus: { width: 500, height: 700 } },
      folders: ['/music']
    })
    const page = pageSettings(stored)
    expect(page).toEqual(defaultSettings())
    page.queue.studio = 'col'
    expect(stored.queue.studio).toBe('tab')
  })
})

describe('parseStoredSettings with a base', () => {
  const current: StoredSettings = {
    template: 'focus',
    queue: { studio: 'col', classic: 'col', focus: 'drawer' },
    visualizer: 'wave',
    theme: 'light',
    volume: 35,
    fetchCovers: true,
    coverSources: { musicbrainz: true, deezer: false, itunes: true },
    closeAction: 'quit',
    plugins: { files: true, radio: true, mfp: false },
    viewSorts: { albums: 'added' },
    artistsShown: 'all',
    viewLooks: { albums: 'list', artists: 'list', artistPage: 'albums' },
    loudness: 'off',
    noCover: 'record',
    windowSizes: { focus: { width: 500, height: 700 } },
    windowMaximized: { focus: true },
    windowPlace: { x: 40, y: 60 },
    folders: ['/m'],
    ai: { provider: 'p', tasks: { a: true }, providers: {} }
  }

  it('keeps the current value of each bad field, not the default', () => {
    const s = parseStoredSettings(
      {
        template: 'mini',
        queue: { studio: 'tab', focus: 9 },
        visualizer: 1,
        theme: 'dark',
        volume: 'x'
      },
      current
    )
    expect(s).toEqual({ ...current, theme: 'dark', queue: { ...current.queue, studio: 'tab' } })
  })

  it('gives the base for junk', () => {
    expect(parseStoredSettings('junk', current)).toEqual(current)
  })
})

describe('isKnownSettingsFile', () => {
  it('knows a good file, a partial one and an empty one', () => {
    expect(isKnownSettingsFile({})).toBe(true)
    expect(isKnownSettingsFile({ theme: 'dark', folders: ['/m', '/n'] })).toBe(true)
    expect(isKnownSettingsFile({ ...defaultSettings(), windowSizes: {}, folders: [] })).toBe(true)
  })

  it('does not know a file the next save would lose something from', () => {
    for (const raw of [
      [],
      'x',
      null,
      { theme: 'blue' },
      { template: 'mini' },
      { visualizer: 'bars' },
      { volume: '50' },
      { queue: [] },
      { windowSizes: 'big' },
      { folders: '/m' },
      { folders: ['relative/path'] },
      { folders: ['/m', 7] },
      { eq: [1, 2] },
      { volume: 150 },
      { volume: 40.5 }
    ])
      expect(isKnownSettingsFile(raw)).toBe(false)
  })

  it('checks each view sort', () => {
    expect(isKnownSettingsFile({ viewSorts: { albums: 'played', 'my-view': 'most-played' } })).toBe(
      true
    )
    for (const viewSorts of [
      [],
      'added',
      { albums: 7 },
      { Albums: 'added' },
      { a: 'x'.repeat(41) }
    ])
      expect(isKnownSettingsFile({ viewSorts })).toBe(false)
  })

  it('drops a bad view sort and keeps the rest', () => {
    const s = parseStoredSettings({ viewSorts: { albums: 'added', x: 7, 'Bad Key': 'year' } })
    expect(s.viewSorts).toEqual({ albums: 'added' })
    expect(parseStoredSettings({ viewSorts: 'x' }).viewSorts).toEqual({})
  })

  it('checks the modes inside queue', () => {
    expect(isKnownSettingsFile({ queue: { studio: 'col' } })).toBe(true)
    expect(isKnownSettingsFile({ queue: { studio: 'col', classic: 'drawer', focus: 'tab' } })).toBe(
      true
    )
    // classic does not offer tab; mini is no template; 7 is no mode
    for (const queue of [{ classic: 'tab' }, { mini: 'tab' }, { studio: 7 }])
      expect(isKnownSettingsFile({ queue })).toBe(false)
  })

  it('checks the sizes inside windowSizes', () => {
    expect(isKnownSettingsFile({ windowSizes: { focus: { width: 500, height: 700 } } })).toBe(true)
    for (const windowSizes of [
      { focus: { width: 100, height: 700 } },
      { focus: { width: 500.4, height: 700 } },
      { focus: { width: 99999, height: 700 } },
      { focus: { width: '500', height: 700 } },
      { focus: { width: 500, height: 700, x: 3 } },
      { focus: [500, 700] },
      { mini: { width: 500, height: 700 } }
    ])
      expect(isKnownSettingsFile({ windowSizes })).toBe(false)
  })
})

describe('window place', () => {
  it('rounds the corner and drops a place that is broken', () => {
    const place = (windowPlace: unknown): unknown =>
      parseStoredSettings({ windowPlace }).windowPlace
    expect(place({ x: 10.6, y: -3.2 })).toEqual({ x: 11, y: -3 })
    expect(place({ x: 1e9, y: 0 })).toEqual({ x: 100000, y: 0 })
    // an old file's flag is read into windowMaximized, not kept here
    expect(place({ x: 1, y: 2, maximized: true })).toEqual({ x: 1, y: 2 })
    for (const bad of [
      null,
      'x',
      { x: 1 },
      { x: '1', y: 2 },
      { x: 1, y: 2, maximized: 'yes' },
      { x: NaN, y: 2, maximized: true }
    ])
      expect(place(bad)).toBeNull()
  })

  it('checks the place in the file', () => {
    expect(isKnownSettingsFile({ windowPlace: null })).toBe(true)
    expect(isKnownSettingsFile({ windowPlace: { x: -5, y: 30 } })).toBe(true)
    // an old file, read into windowMaximized
    expect(isKnownSettingsFile({ windowPlace: { x: -5, y: 30, maximized: true } })).toBe(true)
    for (const windowPlace of [{ x: 1.5, y: 30 }, { x: 1 }, { x: 1, y: 30, w: 3 }, [1, 30]])
      expect(isKnownSettingsFile({ windowPlace })).toBe(false)
  })
})

describe('window maximized', () => {
  it('keeps true and false per known template', () => {
    const s = parseStoredSettings({ windowMaximized: { studio: true, focus: 'yes', mini: true } })
    expect(s.windowMaximized).toEqual({ studio: true })
  })

  it('gives the old maximized flag to the saved template', () => {
    const s = parseStoredSettings({
      template: 'focus',
      windowPlace: { x: 1, y: 2, maximized: true }
    })
    expect(s.windowMaximized).toEqual({ focus: true })
    const off = parseStoredSettings({ windowPlace: { x: 1, y: 2, maximized: false } })
    expect(off.windowMaximized).toEqual({})
  })

  it('takes windowMaximized over the old flag when the file has both', () => {
    const s = parseStoredSettings({
      windowMaximized: { classic: true },
      windowPlace: { x: 1, y: 2, maximized: true }
    })
    expect(s.windowMaximized).toEqual({ classic: true })
  })

  it('checks windowMaximized in the file', () => {
    expect(isKnownSettingsFile({ windowMaximized: { studio: true, focus: false } })).toBe(true)
    for (const windowMaximized of [{ mini: true }, { studio: 1 }, [true], 'yes'])
      expect(isKnownSettingsFile({ windowMaximized })).toBe(false)
  })
})

describe('cover fetch settings', () => {
  it('is on with every source on by default', () => {
    const s = parseStoredSettings(undefined)
    expect(s.fetchCovers).toBe(true)
    expect(s.coverSources).toEqual({ musicbrainz: true, deezer: true, itunes: true })
  })

  it('keeps each source on its own and drops unknown ones', () => {
    const s = parseStoredSettings({
      fetchCovers: true,
      coverSources: { deezer: false, itunes: 'yes', lastfm: true }
    })
    expect(s.fetchCovers).toBe(true)
    expect(s.coverSources).toEqual({ musicbrainz: true, deezer: false, itunes: true })
  })

  it('falls back on a wrong switch', () => {
    expect(parseStoredSettings({ fetchCovers: 1 }).fetchCovers).toBe(true)
  })

  it('keeps a saved off', () => {
    expect(parseStoredSettings({ fetchCovers: false }).fetchCovers).toBe(false)
  })

  it('knows the new fields in a file', () => {
    expect(isKnownSettingsFile({ fetchCovers: true, coverSources: { deezer: false } })).toBe(true)
    expect(isKnownSettingsFile({ coverSources: { lastfm: true } })).toBe(false)
    expect(isKnownSettingsFile({ coverSources: { deezer: 1 } })).toBe(false)
    expect(isKnownSettingsFile({ fetchCovers: 'on' })).toBe(false)
  })

  it('gives the page both fields', () => {
    const p = pageSettings(parseStoredSettings({ fetchCovers: true }))
    expect(p.fetchCovers).toBe(true)
    expect(p.coverSources.itunes).toBe(true)
  })
})

describe('plugins setting', () => {
  it('has each default', () => {
    expect(parseStoredSettings(undefined).plugins).toEqual({ files: true, radio: true, mfp: false })
  })

  it('keeps switches and resets only a wrong one', () => {
    const p = parseStoredSettings({ plugins: { files: false, radio: 'yes', mfp: true } }).plugins
    expect(p).toEqual({ files: false, radio: true, mfp: true })
  })

  it('reads the old mfp field once, when plugins is missing', () => {
    expect(parseStoredSettings({ mfp: true }).plugins.mfp).toBe(true)
    expect(parseStoredSettings({ mfp: 'yes' }).plugins.mfp).toBe(false)
    expect(parseStoredSettings({ mfp: true, plugins: { mfp: false } }).plugins.mfp).toBe(false)
    expect(parseStoredSettings({ mfp: true })).not.toHaveProperty('mfp')
  })

  it('knows the old field and the new one in a file', () => {
    expect(isKnownSettingsFile({ mfp: true })).toBe(true)
    expect(isKnownSettingsFile({ mfp: 1 })).toBe(false)
    expect(isKnownSettingsFile({ plugins: { files: true, mfp: false } })).toBe(true)
  })

  it('sets a file aside for an unknown id or a wrong value', () => {
    expect(isKnownSettingsFile({ plugins: { jukebox: true } })).toBe(false)
    expect(isKnownSettingsFile({ plugins: { mfp: 1 } })).toBe(false)
    expect(isKnownSettingsFile({ plugins: [] })).toBe(false)
  })

  it('gives the page the field', () => {
    expect(pageSettings(parseStoredSettings({ mfp: true })).plugins.mfp).toBe(true)
  })
})

describe('close action setting', () => {
  it('asks by default', () => {
    expect(parseStoredSettings(undefined).closeAction).toBe('ask')
  })

  it('keeps a known choice and falls back on a wrong one', () => {
    expect(parseStoredSettings({ closeAction: 'minimize' }).closeAction).toBe('minimize')
    expect(parseStoredSettings({ closeAction: 'quit' }).closeAction).toBe('quit')
    expect(parseStoredSettings({ closeAction: 'hide' }).closeAction).toBe('ask')
  })

  it('knows the field in a file', () => {
    expect(isKnownSettingsFile({ closeAction: 'quit' })).toBe(true)
    expect(isKnownSettingsFile({ closeAction: 'hide' })).toBe(false)
  })

  it('gives the page the field', () => {
    expect(pageSettings(parseStoredSettings({ closeAction: 'minimize' })).closeAction).toBe(
      'minimize'
    )
  })
})

describe('artists shown setting', () => {
  it('shows album artists by default', () => {
    expect(parseStoredSettings(undefined).artistsShown).toBe('album')
  })

  it('keeps a known choice and falls back on a wrong one', () => {
    expect(parseStoredSettings({ artistsShown: 'all' }).artistsShown).toBe('all')
    expect(parseStoredSettings({ artistsShown: 'some' }).artistsShown).toBe('album')
  })

  it('knows the field in a file', () => {
    expect(isKnownSettingsFile({ artistsShown: 'all' })).toBe(true)
    expect(isKnownSettingsFile({ artistsShown: true })).toBe(false)
  })

  it('gives the page the field', () => {
    expect(pageSettings(parseStoredSettings({ artistsShown: 'all' })).artistsShown).toBe('all')
  })
})

describe('view looks setting (ticket 095)', () => {
  it('is grid, grid and sections by default, also for an old file without it', () => {
    const want = { albums: 'grid', artists: 'grid', artistPage: 'sections' }
    expect(parseStoredSettings(undefined).viewLooks).toEqual(want)
    expect(parseStoredSettings({ theme: 'dark' }).viewLooks).toEqual(want)
    expect(parseStoredSettings({ viewLooks: 'list' }).viewLooks).toEqual(want)
  })

  it('keeps each known look and falls back on a wrong one alone', () => {
    expect(
      parseStoredSettings({
        viewLooks: { albums: 'list', artists: 'shelves', artistPage: 'column' }
      }).viewLooks
    ).toEqual({ albums: 'list', artists: 'shelves', artistPage: 'column' })
    // shelves is an Artists look only; a view left out keeps its default
    expect(
      parseStoredSettings({ viewLooks: { albums: 'shelves', artists: 'list', other: 'x' } })
        .viewLooks
    ).toEqual({ albums: 'grid', artists: 'list', artistPage: 'sections' })
  })

  it('keeps the current look of a bad field from the page', () => {
    const base = parseStoredSettings({ viewLooks: { albums: 'list' } })
    expect(parseStoredSettings({ viewLooks: { albums: 7 } }, base).viewLooks.albums).toBe('list')
  })

  it('knows the field in a file', () => {
    expect(isKnownSettingsFile({ viewLooks: { artists: 'shelves' } })).toBe(true)
    for (const viewLooks of [
      'grid',
      [],
      { albums: 'shelves' },
      { artistPage: 'grid' },
      { songs: 'grid' },
      { albums: 1 }
    ])
      expect(isKnownSettingsFile({ viewLooks })).toBe(false)
  })

  it('gives the page the field, as a copy', () => {
    const stored = parseStoredSettings({ viewLooks: { artistPage: 'albums' } })
    const page = pageSettings(stored)
    expect(page.viewLooks).toEqual({ albums: 'grid', artists: 'grid', artistPage: 'albums' })
    page.viewLooks.albums = 'list'
    expect(stored.viewLooks.albums).toBe('grid')
  })
})

describe('loudness setting', () => {
  it('evens out by album by default', () => {
    expect(parseStoredSettings(undefined).loudness).toBe('album')
  })

  it('keeps a known choice and falls back on a wrong one', () => {
    expect(parseStoredSettings({ loudness: 'off' }).loudness).toBe('off')
    expect(parseStoredSettings({ loudness: 'song' }).loudness).toBe('song')
    expect(parseStoredSettings({ loudness: 'track' }).loudness).toBe('album')
  })

  it('knows the field in a file', () => {
    expect(isKnownSettingsFile({ loudness: 'song' })).toBe(true)
    expect(isKnownSettingsFile({ loudness: 1 })).toBe(false)
  })

  it('gives the page the field', () => {
    expect(pageSettings(parseStoredSettings({ loudness: 'off' })).loudness).toBe('off')
  })
})

describe('no cover setting', () => {
  it('draws rings by default, also for an old file without it', () => {
    expect(parseStoredSettings(undefined).noCover).toBe('rings')
    expect(parseStoredSettings({ theme: 'dark' }).noCover).toBe('rings')
  })

  it('keeps a known choice and falls back on a wrong one', () => {
    expect(parseStoredSettings({ noCover: 'type' }).noCover).toBe('type')
    expect(parseStoredSettings({ noCover: 'record' }).noCover).toBe('record')
    expect(parseStoredSettings({ noCover: 'stars' }).noCover).toBe('rings')
  })

  // an old file is known as it is, so starting the app doesn't copy or write it
  it('knows the field in a file, and a file without it', () => {
    expect(isKnownSettingsFile({ noCover: 'genre' })).toBe(true)
    expect(isKnownSettingsFile({ theme: 'dark' })).toBe(true)
    expect(isKnownSettingsFile({ noCover: 'stars' })).toBe(false)
  })

  it('gives the page the field', () => {
    expect(pageSettings(parseStoredSettings({ noCover: 'type' })).noCover).toBe('type')
  })
})

describe('AI setting', () => {
  it('has the default provider and every task off', () => {
    expect(parseStoredSettings(undefined).ai).toEqual({
      provider: 'openrouter',
      tasks: {},
      providers: {}
    })
  })

  it('drops only the wrong entries', () => {
    const ai = parseStoredSettings({
      ai: {
        provider: '',
        tasks: { a: true, b: 'yes' },
        providers: { p: { model: 'm', n: 3 }, q: 'x' }
      }
    }).ai
    expect(ai).toEqual({
      provider: 'openrouter',
      tasks: { a: true },
      providers: { p: { model: 'm' } }
    })
  })

  it('keeps the current value of a field that is not an object', () => {
    const base = parseStoredSettings({
      ai: { provider: 'p', tasks: { a: true }, providers: { p: { model: 'm' } } }
    })
    expect(parseStoredSettings({ ai: { tasks: [], providers: 1 } }, base).ai).toEqual(base.ai)
    expect(parseStoredSettings({ ai: 'on' }, base).ai).toEqual(base.ai)
  })

  it('knows the field in a file', () => {
    expect(isKnownSettingsFile({ ai: {} })).toBe(true)
    expect(
      isKnownSettingsFile({
        ai: { provider: 'p', tasks: { a: true }, providers: { p: { m: 'x' } } }
      })
    ).toBe(true)
    expect(isKnownSettingsFile({ ai: { provider: '' } })).toBe(false)
    expect(isKnownSettingsFile({ ai: { tasks: { a: 1 } } })).toBe(false)
    expect(isKnownSettingsFile({ ai: { providers: { p: { m: 1 } } } })).toBe(false)
    expect(isKnownSettingsFile({ ai: { providers: { p: 'x' } } })).toBe(false)
    expect(isKnownSettingsFile({ ai: { keys: {} } })).toBe(false)
    expect(isKnownSettingsFile({ ai: [] })).toBe(false)
  })

  it('is not given to the page', () => {
    expect(pageSettings(parseStoredSettings(undefined))).not.toHaveProperty('ai')
  })
})
