// The files main keeps for the page: what happens with a file that can't be
// read, one in a shape this version doesn't know, and bad messages.
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/nowhere' } }))

const { SettingsStore } = await import('./settings-store')
const { isKnownSettingsFile } = await import('../shared/settings')
const { PlaylistFile, QueueFile } = await import('./page-files')

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'spindle-stores-'))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

describe('SettingsStore', () => {
  it('never writes a settings file it could not read', () => {
    const path = join(dir, 'settings.json')
    mkdirSync(path)
    const store = new SettingsStore(path)
    expect(store.readable).toBe(false)
    expect(store.get().folders).toEqual([])
    store.setFromPage({ theme: 'dark' })
    store.setFolders(['/m'])
    store.flushSync()
    // still the folder it was, and nothing next to it
    expect(readdirSync(dir)).toEqual(['settings.json'])
    expect(readdirSync(path)).toEqual([])
  })

  it('removes stray temp files and keeps a copy of an unknown file before saving', () => {
    const path = join(dir, 'settings.json')
    writeFileSync(path, '{"folders":"/m","theme":"dark"}')
    writeFileSync(`${path}.99.1.tmp`, '{')
    const store = new SettingsStore(path)
    expect(store.readable).toBe(true)
    store.setFromPage({ ...store.get(), theme: 'light' })
    store.flushSync()
    expect(readdirSync(dir).sort()).toEqual(['settings.json', 'settings.json.unknown'])
    expect(readFileSync(`${path}.unknown`, 'utf8')).toBe('{"folders":"/m","theme":"dark"}')
    expect(JSON.parse(readFileSync(path, 'utf8')).theme).toBe('light')
  })

  it('keeps the current value of a bad field from the page', () => {
    const path = join(dir, 'settings.json')
    writeFileSync(path, JSON.stringify({ theme: 'dark', visualizer: 'wave', folders: ['/m'] }))
    const store = new SettingsStore(path)
    const { next } = store.setFromPage({ theme: 'blue', visualizer: 'spectrum', folders: [] })
    expect(next.theme).toBe('dark')
    expect(next.visualizer).toBe('spectrum')
    expect(store.get().folders).toEqual(['/m'])
  })

  it("applies the page's choices without saving them when the page could not load the file", () => {
    const path = join(dir, 'settings.json')
    const saved = { template: 'classic', theme: 'dark', volume: 30, folders: ['/m'] }
    writeFileSync(path, JSON.stringify(saved))
    const store = new SettingsStore(path)
    // the page runs on defaults and sends a change
    const r = store.setFromPage({ template: 'focus', theme: 'system', volume: 70 }, false)
    expect(r.before.template).toBe('classic')
    expect(r.next).toMatchObject({ template: 'focus', theme: 'system' })
    expect(store.live().template).toBe('focus')
    // the next change starts from what the window shows now
    expect(store.setFromPage({ template: 'studio' }, false).before.template).toBe('focus')
    // the file and what main saves keep the user's own choices
    expect(store.get()).toMatchObject(saved)
    store.setWindowSize('studio', { width: 1000, height: 700 })
    store.flushSync()
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject(saved)
  })
})

describe('SettingsStore window sizes', () => {
  it('stores every size so the file reads back as known', () => {
    const path = join(dir, 'settings.json')
    const store = new SettingsStore(path)
    // a tiling window manager may ignore the minimum; odd and huge sizes too
    const sizes = [
      { width: 300, height: 200 },
      { width: 1000.6, height: 700.2 },
      { width: 99999, height: 99999 },
      { width: 1200, height: 800 }
    ]
    for (const id of ['studio', 'classic', 'focus'] as const)
      for (const size of sizes) {
        store.setWindowSize(id, size)
        store.flushSync()
        expect(isKnownSettingsFile(JSON.parse(readFileSync(path, 'utf8')))).toBe(true)
      }
    expect(store.get().windowSizes.focus).toEqual({ width: 1200, height: 800 })
    expect(readdirSync(dir)).toEqual(['settings.json'])
  })

  it('stores the window place so the file stays known, and the page cannot change it', () => {
    const path = join(dir, 'settings.json')
    const store = new SettingsStore(path)
    store.setWindowPlace({ x: 12.4, y: -30, maximized: true })
    store.setFromPage({ theme: 'dark', windowPlace: { x: 0, y: 0, maximized: false } })
    store.flushSync()
    const file = JSON.parse(readFileSync(path, 'utf8'))
    expect(isKnownSettingsFile(file)).toBe(true)
    expect(file.windowPlace).toEqual({ x: 12, y: -30, maximized: true })
  })

  it('stores a size below the minimum as the minimum', () => {
    const store = new SettingsStore(join(dir, 'settings.json'))
    store.setWindowSize('studio', { width: 300, height: 200 })
    expect(store.get().windowSizes.studio).toEqual({ width: 860, height: 560 })
  })
})

describe('PlaylistFile', () => {
  it('keeps a copy of a playlists file from a newer version before the first save', () => {
    const path = join(dir, 'playlists.json')
    const v2 = JSON.stringify({ version: 2, playlists: [{ id: 'a', name: 'Mix', trackIds: [] }] })
    writeFileSync(path, v2)
    const file = new PlaylistFile(path)
    file.setFromPage([])
    file.flushSync()
    expect(readFileSync(`${path}.unknown`, 'utf8')).toBe(v2)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ version: 1, playlists: [] })
  })

  it('never writes a playlists file it could not read', () => {
    const path = join(dir, 'playlists.json')
    mkdirSync(path)
    const file = new PlaylistFile(path)
    file.setFromPage([{ id: 'a', name: 'Mix', trackIds: [] }])
    expect(file.get()).toHaveLength(1)
    file.flushSync()
    expect(readdirSync(path)).toEqual([])
  })

  it('renames songs whose ids changed and saves the file', () => {
    const path = join(dir, 'playlists.json')
    const file = new PlaylistFile(path)
    file.setFromPage([
      { id: 'p', name: 'Mix', trackIds: ['old', 'x'] },
      { id: 'q', name: 'Other', trackIds: ['y'] }
    ])
    file.flushSync()
    file.moveIds({ old: 'new' })
    expect(JSON.parse(readFileSync(path, 'utf8')).playlists).toEqual([
      { id: 'p', name: 'Mix', trackIds: ['new', 'x'] },
      { id: 'q', name: 'Other', trackIds: ['y'] }
    ])
    expect(readdirSync(dir)).toEqual(['playlists.json'])
  })
})

describe('moveIds when the new ids can not be written', () => {
  it('says so for a file it could not read (no writer this session)', () => {
    const path = join(dir, 'playlists.json')
    mkdirSync(path)
    const file = new PlaylistFile(path)
    file.setFromPage([{ id: 'p', name: 'Mix', trackIds: ['old'] }])
    expect(file.moveIds({ old: 'new' })).toBe(false)
    // nothing to rename is no failure
    expect(file.moveIds({ zz: 'yy' })).toBe(true)
  })

  it.skipIf(process.getuid?.() === 0)('says so when the write fails', () => {
    const sub = join(dir, 'ro')
    mkdirSync(sub)
    const file = new QueueFile(join(sub, 'queue.json'))
    file.setFromPage({ items: ['old'], index: 0, from: '', pos: 0 })
    chmodSync(sub, 0o500)
    try {
      expect(file.moveIds({ old: 'new' })).toBe(false)
    } finally {
      chmodSync(sub, 0o700)
    }
  })

  it('says it worked when both are on disk', () => {
    const file = new QueueFile(join(dir, 'queue.json'))
    file.setFromPage({ items: ['old'], index: 0, from: '', pos: 0 })
    expect(file.moveIds({ old: 'new' })).toBe(true)
  })
})

describe('QueueFile', () => {
  it('moves the place without the list, and ignores a bad place', () => {
    const path = join(dir, 'queue.json')
    const file = new QueueFile(path)
    file.setFromPage({ items: ['a', 'b'], index: 0, from: 'X', pos: 0 })
    file.setPlace({ index: 1, pos: 4 })
    file.setPlace({ index: 5, pos: 1 })
    file.flushSync()
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
      items: ['a', 'b'],
      index: 1,
      from: 'X',
      pos: 4
    })
  })

  it('renames songs whose ids changed and keeps the place', () => {
    const path = join(dir, 'queue.json')
    const file = new QueueFile(path)
    file.setFromPage({ items: ['a', 'old'], index: 1, from: 'X', pos: 7 })
    file.moveIds({ old: 'new' })
    // on disk at once, before the library process is told
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
      items: ['a', 'new'],
      index: 1,
      from: 'X',
      pos: 7
    })
  })

  it('keeps radio apart from the list: a new list or place leaves it', () => {
    const path = join(dir, 'queue.json')
    const file = new QueueFile(path)
    file.setFromPage({ items: ['a', 'b'], index: 0, from: 'X', pos: 0 })
    file.setPlaying({ kind: 'radio', station: 'metal-only' })
    file.setFromPage({ items: ['c'], index: 0, from: 'Y', pos: 0 })
    file.setPlace({ index: 0, pos: 9 })
    file.flushSync()
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
      items: ['c'],
      index: 0,
      from: 'Y',
      pos: 9,
      kind: 'radio',
      station: 'metal-only'
    })
    file.setPlaying({ kind: 'queue' })
    file.flushSync()
    expect(JSON.parse(readFileSync(path, 'utf8')).kind).toBeUndefined()
  })
})
