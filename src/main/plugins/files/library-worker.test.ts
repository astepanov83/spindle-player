// The library process with Music files off: it reads the index and answers,
// but scans nothing and writes none of its files. Run in this process on a
// fake parent port, with the online lookup off.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyIndex, serializeIndex } from './merge'
import type { WorkerIn, WorkerOut, WorkerStart } from './types'

let dir: string
let music: string
let heard: WorkerOut[]
let send: (m: WorkerIn) => void
let offPruneMs: number

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'spindle-worker-'))
  music = join(dir, 'music')
  mkdirSync(music)
  // not a real mp3: read as a song with an error, which the index keeps
  writeFileSync(join(music, 'a.mp3'), 'not audio')
  heard = []
  let listener: ((e: { data: WorkerIn }) => void) | undefined
  const port = {
    postMessage: (m: WorkerOut) => heard.push(m),
    on: (_: string, f: (e: { data: WorkerIn }) => void) => (listener = f)
  }
  vi.stubGlobal('process', Object.assign(Object.create(process), { parentPort: port }))
  vi.resetModules()
  ;({ offPruneMs } = await import('./library-worker'))
  vi.unstubAllGlobals()
  send = (m) => listener!({ data: m })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function start(on: boolean, keepCovers: string[] = []): void {
  const s: WorkerStart = {
    indexPath: join(dir, 'library.json'),
    coversDir: join(dir, 'covers'),
    folders: [music],
    fetch: { on: false, sources: { musicbrainz: false, deezer: false, itunes: false } },
    fetchedPath: join(dir, 'fetched-covers.json'),
    overridesPath: join(dir, 'artist-overrides.json'),
    userAgent: 'test',
    keepCovers,
    on
  }
  send({ type: 'start', start: s })
}

const scan = (id: number): void => send({ type: 'scan', id, folders: [music], retryFailed: false })
const scanned = (id: number): boolean => heard.some((m) => m.type === 'scanned' && m.id === id)
const settle = (ms = 300): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !done(); i++) await settle(20)
}

describe('the library process', () => {
  it('scans and writes the index while on', async () => {
    start(true)
    scan(1)
    await until(() => scanned(1))
    expect(scanned(1)).toBe(true)
    send({ type: 'flush' })
    expect(existsSync(join(dir, 'library.json'))).toBe(true)
  })

  it('started off: no scan and no files written, the library still given', async () => {
    start(false)
    scan(1)
    send({ type: 'artist-overrides', changes: { x: ['Y'] } })
    send({ type: 'get-library', req: 7 })
    await settle()
    expect(scanned(1)).toBe(false)
    expect(heard.some((m) => m.type === 'reply' && m.req === 7 && m.data)).toBe(true)
    send({ type: 'flush' })
    for (const f of ['library.json', 'fetched-covers.json', 'artist-overrides.json'])
      expect(existsSync(join(dir, f))).toBe(false)
  })

  it('turned off then on: scans again only once on', async () => {
    start(true)
    send({ type: 'set-on', on: false })
    scan(1)
    await settle()
    expect(scanned(1)).toBe(false)
    send({ type: 'set-on', on: true })
    scan(2)
    await until(() => scanned(2))
    expect(scanned(2)).toBe(true)
  })

  describe('a "not found" mark dropped while off', () => {
    const fetchedPath = (): string => join(dir, 'fetched-covers.json')
    const marks = (): string[] =>
      Object.keys(JSON.parse(readFileSync(fetchedPath(), 'utf8')).albums)

    // A source turned on drops the marks, so the album is looked up again.
    async function dropMarkWhileOff(): Promise<void> {
      const albums = { a1: { source: 'none', at: Date.now(), key: 'k' } }
      writeFileSync(fetchedPath(), JSON.stringify({ version: 1, albums, artists: {} }))
      start(false)
      send({ type: 'get-library', req: 1 })
      await until(() => heard.some((m) => m.type === 'reply' && m.req === 1))
      const sources = { musicbrainz: true, deezer: true, itunes: true }
      send({ type: 'fetch-covers', on: false, sources })
    }

    it('is not written while off', async () => {
      await dropMarkWhileOff()
      send({ type: 'flush' })
      expect(marks()).toEqual(['a1'])
    })

    it('is written once turned on', async () => {
      await dropMarkWhileOff()
      send({ type: 'set-on', on: true })
      send({ type: 'flush' })
      expect(marks()).toEqual([])
    })
  })

  describe('the cover cache while off', () => {
    const covers = (): string => join(dir, 'covers')
    const cover = (c: string): string => join(covers(), `${c.repeat(40)}.jpg`)
    const has = (c: string): boolean => existsSync(cover(c))

    // a for the index, b kept by another plugin, c used by nothing
    beforeEach(() => {
      mkdirSync(covers())
      for (const c of 'abc') writeFileSync(cover(c), 'jpg')
      const ix = emptyIndex()
      const path = join(music, 'a.mp3')
      ix.files.set(path, { path, mtime: 1, size: 1, duration: 0, cover: 'a'.repeat(40) })
      writeFileSync(join(dir, 'library.json'), JSON.stringify(serializeIndex(ix)))
    })
    afterEach(() => vi.useRealTimers())

    // Fakes only the timer of the wait, then lets the prune run.
    async function wait(): Promise<void> {
      await vi.advanceTimersByTimeAsync(offPruneMs)
      vi.useRealTimers()
    }

    it('is pruned a while after the start, keeping the index and kept covers', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      start(false, ['b'.repeat(40)])
      await vi.advanceTimersByTimeAsync(offPruneMs - 1000)
      expect(has('c')).toBe(true)
      await wait()
      await until(() => !has('c'))
      expect([has('a'), has('b'), has('c')]).toEqual([true, true, false])
    })

    it('is pruned again after the kept covers change', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      start(false, ['b'.repeat(40), 'c'.repeat(40)])
      await wait()
      await settle()
      expect(has('c')).toBe(true)
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      send({ type: 'keep-covers', hashes: ['b'.repeat(40)] })
      await wait()
      await until(() => !has('c'))
      expect([has('a'), has('b'), has('c')]).toEqual([true, true, false])
    })

    it('is not pruned on its own while on', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      start(true)
      await wait()
      await settle()
      expect(has('c')).toBe(true)
    })
  })
})
