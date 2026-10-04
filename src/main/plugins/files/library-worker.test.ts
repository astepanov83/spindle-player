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

function start(on: boolean, keepCovers: string[] = [], aiOn: Record<string, boolean> = {}): void {
  const s: WorkerStart = {
    indexPath: join(dir, 'library.json'),
    coversDir: join(dir, 'covers'),
    folders: [music],
    fetch: { on: false, sources: { musicbrainz: false, deezer: false, itunes: false } },
    fetchedPath: join(dir, 'fetched-covers.json'),
    overridesPath: join(dir, 'artist-overrides.json'),
    groupsPath: join(dir, 'artist-groups.json'),
    aiOn,
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
    for (const f of [
      'library.json',
      'fetched-covers.json',
      'artist-overrides.json',
      'artist-groups.json'
    ])
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

  describe('a library from an empty index', () => {
    const decode = (b: Uint8Array): { partial?: true } => JSON.parse(new TextDecoder().decode(b))
    async function library(req: number): Promise<{ partial?: true }> {
      send({ type: 'get-library', req })
      await until(() => heard.some((m) => m.type === 'reply' && m.req === req))
      const m = heard.find((m) => m.type === 'reply' && m.req === req)
      return decode((m as { data: Uint8Array }).data)
    }

    it('is partial until the first scan ended, which says so in a patch', async () => {
      start(true)
      expect((await library(1)).partial).toBe(true)
      scan(2)
      await until(() => scanned(2))
      const sent = heard.filter((m) => m.type === 'library')
      expect(decode((sent.at(-1) as { bytes: Uint8Array }).bytes).partial).toBeUndefined()
      expect((await library(3)).partial).toBeUndefined()
    })

    it('is not partial when library.json had songs', async () => {
      const ix = emptyIndex()
      const path = join(music, 'a.mp3')
      ix.files.set(path, { path, mtime: 1, size: 1, duration: 0 })
      writeFileSync(join(dir, 'library.json'), JSON.stringify(serializeIndex(ix)))
      start(true)
      expect((await library(1)).partial).toBeUndefined()
    })
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

  describe('artist-groups.json (ticket 068)', () => {
    const groupsPath = (): string => join(dir, 'artist-groups.json')
    const saved = (): { groups: Record<string, string>; asked: string[] } =>
      JSON.parse(readFileSync(groupsPath(), 'utf8'))
    const decode = (b: Uint8Array): { tracks?: { artist: string }[] } =>
      JSON.parse(new TextDecoder().decode(b))
    // the song in the music folder has no tags: its artist is "Unknown artist"
    const write = (v: unknown): void =>
      writeFileSync(groupsPath(), typeof v === 'string' ? v : JSON.stringify(v))
    const twoKeys = {
      version: 1,
      groups: { unknownartist: 'Nobody', gone: 'Gone' },
      asked: ['unknownartist', 'gone']
    }

    async function ready(): Promise<void> {
      send({ type: 'get-library', req: 99 })
      await until(() => heard.some((m) => m.type === 'reply' && m.req === 99))
    }

    it('drops keys of tags that are gone after a scan that ran to the end', async () => {
      write(twoKeys)
      start(true)
      scan(1)
      await until(() => scanned(1))
      send({ type: 'flush' })
      expect(saved()).toEqual({
        version: 1,
        groups: { unknownartist: 'Nobody' },
        asked: ['unknownartist']
      })
    })

    it('keeps them after a scan that was cut short', async () => {
      write(twoKeys)
      start(true)
      scan(1)
      send({ type: 'stop' })
      await settle()
      send({ type: 'flush' })
      expect(scanned(1)).toBe(false)
      expect(saved()).toEqual(twoKeys)
    })

    it('sets a broken file aside', async () => {
      write('{ not json')
      start(true)
      await ready()
      expect(readFileSync(groupsPath() + '.broken', 'utf8')).toBe('{ not json')
    })

    it('sets a file of another version aside', async () => {
      write({ version: 2, groups: {}, asked: [] })
      start(true)
      await ready()
      expect(existsSync(groupsPath() + '.unknown')).toBe(true)
    })

    // an index with one song tagged "Bjork", and a group for it
    const bjork = { version: 1, groups: { bjork: 'Björk' }, asked: ['bjork'] }
    function bjorkIndex(): void {
      const ix = emptyIndex()
      const path = join(music, 'a.mp3')
      ix.files.set(path, { path, mtime: 1, size: 1, duration: 0, artist: 'Bjork' })
      writeFileSync(join(dir, 'library.json'), JSON.stringify(serializeIndex(ix)))
      write(bjork)
    }

    it('applies groups only while the task is on, and republishes when that changes', async () => {
      bjorkIndex()
      start(false)
      await ready()
      const reply = heard.find((m) => m.type === 'reply' && m.req === 99) as { data: Uint8Array }
      expect(decode(reply.data).tracks?.[0].artist).toBe('Bjork')
      send({ type: 'ai-on', tasks: { 'artist-groups': true } })
      await until(() => heard.some((m) => m.type === 'library'))
      const patch = heard.find((m) => m.type === 'library') as { bytes: Uint8Array }
      expect(decode(patch.bytes).tracks?.[0].artist).toBe('Björk')
      send({ type: 'ai-on', tasks: { 'artist-groups': false } })
      await until(() => heard.filter((m) => m.type === 'library').length === 2)
      const off = heard.filter((m) => m.type === 'library')[1] as { bytes: Uint8Array }
      expect(decode(off.bytes).tracks?.[0].artist).toBe('Bjork')
      // switched off, the file is kept
      expect(saved()).toEqual(bjork)
    })

    describe('the job', () => {
      // "Bjork" once and "Björk" twice, so "Björk" is the name shown
      function twins(): void {
        const ix = emptyIndex()
        const add = (name: string, artist: string, album: string): void => {
          const path = join(music, name)
          ix.files.set(path, { path, mtime: 1, size: 1, duration: 0, artist, album, title: name })
        }
        add('1.mp3', 'Bjork', 'Debut')
        add('2.mp3', 'Björk', 'Homogenic')
        add('3.mp3', 'Björk', 'Post')
        writeFileSync(join(dir, 'library.json'), JSON.stringify(serializeIndex(ix)))
      }
      const calls = (type: string): (WorkerOut & { id: number })[] =>
        heard.filter((m) => m.type === type) as (WorkerOut & { id: number })[]
      async function call(type: string, n: number): Promise<WorkerOut & { id: number }> {
        await until(() => calls(type).length >= n)
        return calls(type)[n - 1]
      }
      const answer = (model: string): unknown => ({
        ok: true,
        model,
        json: { matches: [{ check: 1, same: 2, why: 'accent' }] }
      })

      it('runs when the task turns on, asking main, then saves and shows the group', async () => {
        twins()
        start(true)
        await ready()
        send({ type: 'ai-on', tasks: { 'artist-groups': true } })
        send({ type: 'ai-reply', id: (await call('ai-max-input', 1)).id, max: 100_000 })
        const first = await call('ai-ask', 1)
        expect(first).toMatchObject({ task: 'artist-groups' })
        send({ type: 'ai-reply', id: first.id, answer: answer('m1') as never })
        const second = await call('ai-ask', 2)
        expect(second).toMatchObject({ avoid: ['m1'] })
        send({ type: 'ai-reply', id: second.id, answer: answer('m2') as never })
        await until(() =>
          heard.some((m) => m.type === 'status' && m.status.groups?.state === 'done')
        )
        const last = heard.filter((m) => m.type === 'library').at(-1) as { bytes: Uint8Array }
        // a patch: only the song tagged "Bjork" changed
        expect(decode(last.bytes).tracks?.map((t) => t.artist)).toEqual(['Björk'])
        send({ type: 'flush' })
        expect(saved()).toEqual({
          version: 1,
          groups: { bjork: 'Björk', björk: 'Björk' },
          asked: ['bjork', 'björk']
        })
      })

      it('is stopped by a new scan', async () => {
        twins()
        start(true, [], { 'artist-groups': true })
        await ready()
        // turned off and on again: a run starts
        send({ type: 'ai-on', tasks: {} })
        send({ type: 'ai-on', tasks: { 'artist-groups': true } })
        send({ type: 'ai-reply', id: (await call('ai-max-input', 1)).id, max: 100_000 })
        const ask = await call('ai-ask', 1)
        scan(1)
        expect(heard.at(-1)).toEqual({ type: 'ai-cancel', id: ask.id })
      })
    })

    it('applies them from the start data when the task is on', async () => {
      bjorkIndex()
      start(false, [], { 'artist-groups': true })
      await ready()
      const reply = heard.find((m) => m.type === 'reply' && m.req === 99) as { data: Uint8Array }
      expect(decode(reply.data).tracks?.[0].artist).toBe('Björk')
    })
  })
})
