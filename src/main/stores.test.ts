// The files main keeps for the page: what happens with a file that can't be
// read, one in a shape this version doesn't know, and bad messages.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/nowhere' } }))

const { SettingsStore } = await import('./settings-store')
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
})
