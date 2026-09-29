import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Station } from '../../shared/stations'
import { metalOnly, RadioHistoryStore, StationsStore } from './stations-store'

let dir: string
let path: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'spindle-radio-'))
  path = join(dir, 'stations.json')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

const st = (id: string): Station => ({
  id,
  name: id,
  tags: [],
  streams: [{ url: `https://${id}.example/s`, bitrate: 128, codec: 'mp3' }]
})
const onDisk = (): Station[] => JSON.parse(readFileSync(path, 'utf8')).stations

describe('StationsStore', () => {
  it('writes Metal Only when the file is missing, at once', () => {
    const store = new StationsStore(path)
    expect(store.list().map((s) => s.id)).toEqual(['metal-only'])
    expect(onDisk().map((s) => s.id)).toEqual(['metal-only'])
    expect(metalOnly.pls).toEqual(['https://metal-only.streampanel.cloud/listen.pls'])
  })

  it('reads the file it wrote on the first run as its own, with no copy kept aside', () => {
    new StationsStore(path).flushSync()
    new StationsStore(path)
    expect(readdirSync(dir)).toEqual(['stations.json'])
  })

  it('does not add Metal Only twice', () => {
    new StationsStore(path).flushSync()
    const again = new StationsStore(path)
    expect(again.list().map((s) => s.id)).toEqual(['metal-only'])
  })

  it('keeps Metal Only removed after a restart', () => {
    const store = new StationsStore(path)
    store.remove('metal-only')
    store.flushSync()
    expect(new StationsStore(path).list()).toEqual([])
  })

  it('keeps a broken file aside and does not seed Metal Only', () => {
    writeFileSync(path, '{ not json')
    const store = new StationsStore(path)
    expect(store.list()).toEqual([])
    expect(readdirSync(dir).sort()).toEqual(['stations.json', 'stations.json.broken'])
    expect(readFileSync(path, 'utf8')).toBe('{ not json')
  })

  it('never writes a file it could not read', () => {
    mkdirSync(path)
    const store = new StationsStore(path)
    expect(store.list()).toEqual([])
    store.save(st('a'))
    store.flushSync()
    expect(readdirSync(dir)).toEqual(['stations.json'])
  })

  it('saves, moves, chooses and removes, and keeps the order after a restart', () => {
    const store = new StationsStore(path)
    store.save(st('a'))
    store.save(st('b'))
    store.move('b', -1)
    store.choose('a', 'https://a.example/s')
    expect(store.list().map((s) => s.id)).toEqual(['metal-only', 'b', 'a'])
    store.remove('metal-only')
    store.flushSync()
    const again = new StationsStore(path)
    expect(again.list().map((s) => s.id)).toEqual(['b', 'a'])
    expect(again.get('a')?.chosen).toBe('https://a.example/s')
    expect(again.get('zzz')).toBeUndefined()
  })

  it('ignores a station from the page that is not valid', () => {
    const store = new StationsStore(path)
    expect(store.save({ id: '../x', name: 'Bad' }).map((s) => s.id)).toEqual(['metal-only'])
    expect(store.save('junk').map((s) => s.id)).toEqual(['metal-only'])
    expect(store.move('metal-only', 5)).toHaveLength(1)
    expect(store.remove(7)).toHaveLength(1)
  })

  it('adds streams found on the server to a saved station', () => {
    const store = new StationsStore(path)
    store.save(st('a'))
    store.addStreams('a', [
      { url: 'https://a.example/hq', bitrate: 320, codec: 'mp3' },
      // same bitrate and codec as the saved one
      { url: 'https://a.example/autodj', bitrate: 128, codec: 'mp3' }
    ])
    expect(store.get('a')?.streams.map((s) => s.url)).toEqual([
      'https://a.example/s',
      'https://a.example/hq'
    ])
    // a station that was removed while the lookup ran is not brought back
    store.remove('a')
    store.addStreams('a', [{ url: 'https://a.example/x', bitrate: 64 }])
    expect(store.get('a')).toBeUndefined()
  })

  it('keeps the chosen stream when streams are added', () => {
    const store = new StationsStore(path)
    store.save({ ...st('a'), chosen: 'https://a.example/s' })
    store.addStreams('a', [{ url: 'https://a.example/hq', bitrate: 320 }])
    expect(store.get('a')?.chosen).toBe('https://a.example/s')
  })
})

describe('RadioHistoryStore', () => {
  const hpath = (): string => join(dir, 'radio-history.json')

  it('keeps the last 50 titles of a station, saved with a delay', () => {
    const h = new RadioHistoryStore(
      hpath(),
      () => true,
      () => 1000
    )
    for (let i = 0; i < 60; i++) h.add('a', `song ${i}`, i)
    expect(h.get('a')).toHaveLength(50)
    expect(h.get('a')[49].title).toBe('song 59')
    expect(h.get('nobody')).toEqual([])
    h.flushSync()
    expect(new RadioHistoryStore(hpath(), () => true).get('a')).toHaveLength(50)
  })

  it('drops an unsaved station not played for 30 days when it opens', () => {
    const day = 86_400_000
    const now = 100 * day
    const first = new RadioHistoryStore(
      hpath(),
      () => true,
      () => now
    )
    first.add('old', 'x', now - 40 * day)
    first.add('saved', 'x', now - 40 * day)
    first.add('fresh', 'x', now - day)
    first.flushSync()
    const again = new RadioHistoryStore(
      hpath(),
      (id) => id === 'saved',
      () => now
    )
    expect(again.get('old')).toEqual([])
    expect(again.get('saved')).toHaveLength(1)
    expect(again.get('fresh')).toHaveLength(1)
  })

  it('keeps a broken file aside and starts empty', () => {
    writeFileSync(hpath(), 'nope')
    const h = new RadioHistoryStore(hpath(), () => true)
    expect(h.get('a')).toEqual([])
    expect(readdirSync(dir)).toContain('radio-history.json.broken')
  })
})
