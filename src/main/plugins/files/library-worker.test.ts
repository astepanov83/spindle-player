// The library process with Music files off: it reads the index and answers,
// but scans nothing and writes none of its files. Run in this process on a
// fake parent port, with the online lookup off.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyIndex, serializeIndex } from './merge'
import { readerVersion, type WorkerIn, type WorkerOut, type WorkerStart } from './types'
import { joinSystem } from './group-artists'
import { flacWith } from './fixtures/flac'
import { cueTrackId, shortHash } from '../../ids'
import type { SongFileInfo } from '../../../shared/plugins/files/song-info'

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
  await boot()
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

// A new library process, as after a quit; flush the one before first.
async function boot(): Promise<void> {
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
}

function start(
  on: boolean,
  keepCovers: string[] = [],
  aiOn: Record<string, boolean> = {},
  aiEnabled: Record<string, boolean> = aiOn
): void {
  const s: WorkerStart = {
    indexPath: join(dir, 'library.json'),
    coversDir: join(dir, 'covers'),
    folders: [music],
    fetch: { on: false, sources: { musicbrainz: false, deezer: false, itunes: false } },
    fetchedPath: join(dir, 'fetched-covers.json'),
    artistsPath: join(dir, 'artists.json'),
    aiCachePath: join(dir, 'artist-ai-cache.json'),
    oldOverridesPath: join(dir, 'artist-overrides.json'),
    oldGroupsPath: join(dir, 'artist-groups.json'),
    tagFixesPath: join(dir, 'tag-fixes.json'),
    aiOn,
    aiEnabled,
    userAgent: 'test',
    keepCovers,
    on
  }
  send({ type: 'start', start: s })
}

// the task's on() and enabled() from main; enabled is on unless said
const aiOn = (tasks: Record<string, boolean>, enabled = tasks): void =>
  send({ type: 'ai-on', tasks, enabled })
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
    send({ type: 'set-artists', changes: { x: ['Y'] } })
    send({ type: 'get-library', req: 7 })
    await settle()
    expect(scanned(1)).toBe(false)
    expect(heard.some((m) => m.type === 'reply' && m.req === 7 && m.data)).toBe(true)
    send({ type: 'flush' })
    for (const f of ['library.json', 'fetched-covers.json', 'artists.json', 'artist-ai-cache.json'])
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

  describe('artists.json (ticket 069)', () => {
    const artistsPath = (): string => join(dir, 'artists.json')
    const cachePath = (): string => join(dir, 'artist-ai-cache.json')
    const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))
    const write = (path: string, v: unknown): void =>
      writeFileSync(path, typeof v === 'string' ? v : JSON.stringify(v))
    interface Song {
      title?: string
      artist: string
      artists?: string[]
      grouped?: true
    }
    const decode = (b: Uint8Array): { tracks?: Song[] } => JSON.parse(new TextDecoder().decode(b))
    // an artist: tags as [tag, by]
    const artist = (name: string, nameBy: string, ...tags: [string, string][]): unknown => ({
      name,
      nameBy,
      tags: tags.map(([tag, by]) => ({ tag, by }))
    })

    async function ready(): Promise<void> {
      send({ type: 'get-library', req: 99 })
      await until(() => heard.some((m) => m.type === 'reply' && m.req === 99))
    }
    let req = 1000
    // the songs as the page gets them now, by title
    async function songs(): Promise<Record<string, Song>> {
      const r = ++req
      send({ type: 'get-library', req: r })
      await until(() => heard.some((m) => m.type === 'reply' && m.req === r))
      const m = heard.find((m) => m.type === 'reply' && m.req === r) as { data: Uint8Array }
      return Object.fromEntries((decode(m.data).tracks ?? []).map((t) => [t.title, t]))
    }
    const artistOf = async (title: string): Promise<string> => (await songs())[title].artist

    // An index of one song per tag, titled by the tag. onDisk: the files exist
    // as the index has them, so a scan keeps their tags.
    function index(tags: string[], onDisk = false): void {
      // read by this tag reader, so a scan doesn't read the files again
      const ix = { ...emptyIndex(), reader: readerVersion }
      tags.forEach((artist, i) => {
        const path = join(music, `${i}.mp3`)
        let mtime = 1
        let size = 1
        if (onDisk) {
          writeFileSync(path, 'x')
          const st = statSync(path, { bigint: true })
          mtime = Number(st.mtimeMs)
          size = Number(st.size)
        }
        const title = tags.indexOf(artist) === i ? artist : `${artist} ${i}`
        ix.files.set(path, { path, mtime, size, duration: 0, artist, album: `A${i}`, title })
      })
      writeFileSync(join(dir, 'library.json'), JSON.stringify(serializeIndex(ix)))
    }

    describe('pruning', () => {
      // the song in the music folder has no tags: its artist is "Unknown artist"
      const two = {
        version: 1,
        artists: [artist('Nobody', 'ai', ['Unknown artist', 'ai'], ['Gone', 'ai'])]
      }
      const asked = { version: 1, prompt: 2, split: [], joined: ['unknownartist', 'gone'] }

      it('drops links and asked keys of tags that are gone after a scan that ran to the end', async () => {
        write(artistsPath(), two)
        write(cachePath(), asked)
        start(true)
        scan(1)
        await until(() => scanned(1))
        send({ type: 'flush' })
        expect(read(artistsPath())).toEqual({
          version: 1,
          artists: [artist('Nobody', 'ai', ['Unknown artist', 'ai'])]
        })
        expect(read(cachePath())).toEqual({
          version: 1,
          prompt: 2,
          split: [],
          joined: ['unknownartist'],
          checking: []
        })
      })

      it('keeps them after a scan that was cut short', async () => {
        write(artistsPath(), two)
        write(cachePath(), asked)
        start(true)
        scan(1)
        send({ type: 'stop' })
        await settle()
        send({ type: 'flush' })
        expect(scanned(1)).toBe(false)
        expect(read(artistsPath())).toEqual(two)
        expect(read(cachePath())).toEqual(asked)
      })

      it('keeps the names you gave in the cache, so they are not asked again', async () => {
        index(['kino'], true)
        write(artistsPath(), { version: 1, artists: [artist('Кино', 'you', ['kino', 'you'])] })
        write(cachePath(), { version: 1, prompt: 2, split: [], joined: ['кино', 'gone'] })
        start(true)
        scan(1)
        await until(() => scanned(1))
        send({ type: 'flush' })
        expect(read(cachePath())).toEqual({
          version: 1,
          prompt: 2,
          split: [],
          joined: ['кино'],
          checking: []
        })
      })
    })

    it('sets a broken file aside, and one of another version', async () => {
      write(artistsPath(), '{ not json')
      write(cachePath(), { version: 2, asked: [] })
      start(true)
      await ready()
      expect(readFileSync(artistsPath() + '.broken', 'utf8')).toBe('{ not json')
      expect(existsSync(cachePath() + '.unknown')).toBe(true)
    })

    describe('AI links', () => {
      const bjork = { version: 1, artists: [artist('Björk', 'ai', ['Bjork', 'ai'])] }
      beforeEach(() => {
        index(['Bjork'])
        write(artistsPath(), bjork)
      })

      it('are applied only while the task is on, and republish when that changes', async () => {
        start(false)
        await ready()
        const reply = heard.find((m) => m.type === 'reply' && m.req === 99) as {
          data: Uint8Array
        }
        expect(decode(reply.data).tracks?.[0].artist).toBe('Bjork')
        aiOn({ 'artist-groups': true })
        await until(() => heard.some((m) => m.type === 'library'))
        const patch = heard.find((m) => m.type === 'library') as { bytes: Uint8Array }
        expect(decode(patch.bytes).tracks?.[0].artist).toBe('Björk')
        aiOn({ 'artist-groups': false })
        await until(() => heard.filter((m) => m.type === 'library').length === 2)
        const off = heard.filter((m) => m.type === 'library')[1] as { bytes: Uint8Array }
        expect(decode(off.bytes).tracks?.[0].artist).toBe('Bjork')
        // switched off, the file keeps them
        expect(read(artistsPath())).toEqual(bjork)
      })

      it('are applied while switched on with the provider not ready, and no job runs', async () => {
        start(true, [], {}, { 'artist-groups': true })
        await ready()
        expect(await artistOf('Bjork')).toBe('Björk')
        await settle(50)
        expect(heard.some((m) => m.type === 'ai-max-input')).toBe(false)
      })

      it('stay shown when the provider stops being ready, and hide when switched off', async () => {
        start(false, [], { 'artist-groups': true })
        await ready()
        // a refused key or Disconnect: no new library, the links stay
        aiOn({}, { 'artist-groups': true })
        await settle(50)
        expect(heard.filter((m) => m.type === 'library')).toEqual([])
        aiOn({}, {})
        await until(() => heard.some((m) => m.type === 'library'))
        const off = heard.find((m) => m.type === 'library') as { bytes: Uint8Array }
        expect(decode(off.bytes).tracks?.[0].artist).toBe('Bjork')
      })

      it('are applied from the start data when the task is on', async () => {
        start(false, [], { 'artist-groups': true })
        await ready()
        expect(await artistOf('Bjork')).toBe('Björk')
      })
    })

    describe('the job', () => {
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
      // no tag split
      const noSplit = (model: string): unknown => ({ ok: true, model, json: { tags: [] } })
      // Answers the run's maxInput and its four asks (split twice, then join
      // twice), n the asks before it.
      async function answerRun(n = 0): Promise<void> {
        const runs = calls('ai-max-input').length
        send({ type: 'ai-reply', id: (await call('ai-max-input', runs || 1)).id, max: 100_000 })
        const answers = [noSplit('m1'), noSplit('m2'), answer('m1'), answer('m2')]
        for (const [i, a] of answers.entries()) {
          const ask = await call('ai-ask', n + i + 1)
          expect(ask).toMatchObject({ task: 'artist-groups', ...(i % 2 ? { avoid: ['m1'] } : {}) })
          send({ type: 'ai-reply', id: ask.id, answer: a as never })
        }
        await until(() =>
          heard.some((m) => m.type === 'status' && m.status.groups?.state === 'done')
        )
      }

      it('runs when the task turns on, asking main, then saves and shows the group', async () => {
        // "Bjork" once and "Björk" twice, so "Björk" is the name shown
        index(['Bjork', 'Björk', 'Björk'])
        start(true)
        await ready()
        aiOn({ 'artist-groups': true })
        await answerRun()
        const last = heard.filter((m) => m.type === 'library').at(-1) as { bytes: Uint8Array }
        // a patch: only the song tagged "Bjork" changed
        expect(decode(last.bytes).tracks?.map((t) => t.artist)).toEqual(['Björk'])
        send({ type: 'flush' })
        expect(read(artistsPath())).toEqual({
          version: 1,
          artists: [artist('Björk', 'ai', ['Bjork', 'ai'], ['Björk', 'ai'])]
        })
        expect(read(cachePath())).toEqual({
          version: 1,
          prompt: 2,
          split: ['bjork', 'björk'],
          joined: ['bjork', 'björk'],
          checking: []
        })
      })

      it('checks all names again when the cache is from another prompt number', async () => {
        index(['Bjork', 'Björk', 'Björk'])
        write(artistsPath(), { version: 1, artists: [artist('Björk', 'ai', ['Bjork', 'ai'])] })
        write(cachePath(), { version: 1, prompt: 1, split: [], joined: ['bjork', 'björk'] })
        start(true)
        await ready()
        aiOn({ 'artist-groups': true })
        send({ type: 'ai-reply', id: (await call('ai-max-input', 1)).id, max: 100_000 })
        const none = { ok: true, model: 'm', json: { tags: [], matches: [] } }
        for (let i = 1; i <= 4; i++)
          send({ type: 'ai-reply', id: (await call('ai-ask', i)).id, answer: none as never })
        await until(() =>
          heard.some((m) => m.type === 'status' && m.status.groups?.state === 'done')
        )
        send({ type: 'flush' })
        // asked again, and no answer gave the old link again
        expect(read(artistsPath())).toEqual({ version: 1, artists: [] })
        expect(read(cachePath())).toMatchObject({ prompt: 2, joined: ['bjork', 'björk'] })
        expect(await artistOf('Bjork')).toBe('Bjork')
      })

      it('ai-recheck is ignored while the task is off, and stops a running job to start a full check', async () => {
        index(['Bjork', 'Björk', 'Björk'])
        start(true)
        await ready()
        send({ type: 'ai-recheck' })
        await settle(50)
        expect(calls('ai-max-input')).toHaveLength(0)
        aiOn({ 'artist-groups': true })
        // the first job waits on its max-input answer, which never comes
        await call('ai-max-input', 1)
        send({ type: 'ai-recheck' })
        await call('ai-max-input', 2)
        expect(calls('ai-ask')).toHaveLength(0)
        // only the second job goes on: four asks, then done
        send({ type: 'ai-reply', id: calls('ai-max-input')[1].id, max: 100_000 })
        const answers = [noSplit('m1'), noSplit('m2'), answer('m1'), answer('m2')]
        for (const [i, a] of answers.entries())
          send({ type: 'ai-reply', id: (await call('ai-ask', i + 1)).id, answer: a as never })
        await until(() =>
          heard.some((m) => m.type === 'status' && m.status.groups?.state === 'done')
        )
        expect(calls('ai-ask')).toHaveLength(4)
        expect(calls('ai-max-input')).toHaveLength(2)
      })

      it('ai-recheck after a finished run asks every name again', async () => {
        index(['Bjork', 'Björk', 'Björk'])
        start(true)
        await ready()
        aiOn({ 'artist-groups': true })
        await answerRun()
        send({ type: 'ai-recheck' })
        send({ type: 'ai-reply', id: (await call('ai-max-input', 2)).id, max: 100_000 })
        // the names were asked before; a full check asks them again
        await call('ai-ask', 5)
      })

      it('goes on with a full check the cache file says is under way', async () => {
        index(['Bjork', 'Björk', 'Björk'])
        write(artistsPath(), { version: 1, artists: [artist('Björk', 'ai', ['Bjork', 'ai'])] })
        // stopped in the join step, before a restart
        write(cachePath(), {
          version: 1,
          prompt: 2,
          split: ['bjork', 'björk'],
          joined: [],
          checking: ['bjork']
        })
        start(true)
        await ready()
        aiOn({ 'artist-groups': true })
        send({ type: 'ai-reply', id: (await call('ai-max-input', 1)).id, max: 100_000 })
        const none = { ok: true, model: 'm', json: { matches: [] } }
        for (let i = 1; i <= 2; i++) {
          const ask = await call('ai-ask', i)
          expect(ask).toMatchObject({ req: { system: joinSystem } })
          send({ type: 'ai-reply', id: ask.id, answer: none as never })
        }
        await until(() =>
          heard.some((m) => m.type === 'status' && m.status.groups?.state === 'done')
        )
        send({ type: 'flush' })
        expect(calls('ai-ask')).toHaveLength(2)
        expect(read(artistsPath())).toEqual({ version: 1, artists: [] })
        expect(read(cachePath())).toEqual({
          version: 1,
          prompt: 2,
          split: ['bjork', 'björk'],
          joined: ['bjork', 'björk'],
          checking: []
        })
      })

      it('turned on during a scan, runs once after the scan ends', async () => {
        index(['Bjork', 'Björk', 'Björk'], true)
        start(true)
        await ready()
        scan(1)
        aiOn({ 'artist-groups': true })
        await settle(0)
        expect(calls('ai-max-input')).toEqual([])
        await answerRun()
        const at = (type: string): number => heard.findIndex((m) => m.type === type)
        expect(scanned(1)).toBe(true)
        expect(at('scanned')).toBeLessThan(at('ai-max-input'))
        await settle(50)
        expect(calls('ai-max-input')).toHaveLength(1)
        expect(calls('ai-ask')).toHaveLength(4)
        send({ type: 'flush' })
        expect(read(artistsPath())).toMatchObject({
          artists: [artist('Björk', 'ai', ['Bjork', 'ai'], ['Björk', 'ai'])]
        })
      })

      it('is stopped by a new scan', async () => {
        index(['Bjork', 'Björk', 'Björk'])
        start(true, [], { 'artist-groups': true })
        await ready()
        // turned off and on again: a run starts
        aiOn({})
        aiOn({ 'artist-groups': true })
        send({ type: 'ai-reply', id: (await call('ai-max-input', 1)).id, max: 100_000 })
        const ask = await call('ai-ask', 1)
        scan(1)
        expect(heard.at(-1)).toEqual({ type: 'ai-cancel', id: ask.id })
        // else the run after the scan posts into the next test's messages
        aiOn({})
      })

      it('a split part with no tag of its own stays asked after a scan and a restart', async () => {
        index(['Sadness, Forgotten', 'Sadness'], true)
        start(true)
        await ready()
        aiOn({ 'artist-groups': true })
        send({ type: 'ai-reply', id: (await call('ai-max-input', 1)).id, max: 100_000 })
        // "Sadness" is 1, "Sadness, Forgotten" is 2
        const split = (model: string): unknown => ({
          ok: true,
          model,
          json: { tags: [{ check: 2, artists: ['Sadness', 'Forgotten'], why: 'two' }] }
        })
        const none = (model: string): unknown => ({ ok: true, model, json: { matches: [] } })
        const answers = [split('m1'), split('m2'), none('m1'), none('m2')]
        for (const [i, a] of answers.entries())
          send({ type: 'ai-reply', id: (await call('ai-ask', i + 1)).id, answer: a as never })
        await until(() =>
          heard.some((m) => m.type === 'status' && m.status.groups?.state === 'done')
        )

        // the scan's end prunes the cache, then starts a run that has nothing to ask
        scan(1)
        await until(() => scanned(1))
        await settle(50)
        expect(calls('ai-max-input')).toHaveLength(1)
        send({ type: 'flush' })
        expect(read(cachePath())).toMatchObject({ joined: ['forgotten', 'sadness'] })

        await boot()
        start(true, [], { 'artist-groups': true })
        await ready()
        await settle(50)
        expect(calls('ai-max-input')).toHaveLength(0)
        expect(calls('ai-ask')).toHaveLength(0)
      })

      it('end to end: Edit artist, an AI group, AI off, Use tag, and a restart keeps it all', async () => {
        index(['kino', 'Sadness, Stellafera', 'Bjork', 'Björk', 'Björk'])
        // shown but no job yet
        start(true, [], {}, { 'artist-groups': true })
        await ready()

        // Edit artist: a rename and a split
        send({ type: 'set-artists', changes: { kino: ['Кино'] } })
        send({ type: 'set-artists', changes: { 'sadness,stellafera': ['Sadness', 'Stellafera'] } })
        let now = await songs()
        expect(now['kino'].artist).toBe('Кино')
        expect(now['Sadness, Stellafera'].artists).toEqual(['Sadness', 'Stellafera'])

        // the AI groups "Bjork" with "Björk"; names you gave are not tags to link
        aiOn({ 'artist-groups': true })
        await answerRun()
        now = await songs()
        expect(now['Bjork']).toMatchObject({ artist: 'Björk', grouped: true })

        // switched off, the AI's links hide; yours stay
        aiOn({}, {})
        now = await songs()
        expect(now['Bjork'].artist).toBe('Bjork')
        expect(now['kino'].artist).toBe('Кино')
        aiOn({}, { 'artist-groups': true })
        expect(await artistOf('Bjork')).toBe('Björk')

        // Use tag on the AI's link: the tag as its own name, linked by you
        send({ type: 'set-artists', changes: { bjork: null } })
        expect(await artistOf('Bjork')).toBe('Bjork')
        send({ type: 'flush' })
        expect(read(artistsPath())).toEqual({
          version: 1,
          artists: [
            artist('Кино', 'you', ['kino', 'you']),
            artist('Sadness', 'you', ['Sadness, Stellafera', 'you']),
            artist('Stellafera', 'you', ['Sadness, Stellafera', 'you']),
            artist('Björk', 'ai', ['Björk', 'ai']),
            artist('Bjork', 'you', ['Bjork', 'you'])
          ]
        })

        await boot()
        start(true, [], {}, { 'artist-groups': true })
        await ready()
        now = await songs()
        expect(now['kino'].artist).toBe('Кино')
        expect(now['Sadness, Stellafera'].artists).toEqual(['Sadness', 'Stellafera'])
        expect(now['Bjork'].artist).toBe('Bjork')
        expect(now['Björk'].artist).toBe('Björk')
      })
    })

    describe('the old files', () => {
      const oldOverrides = (): string => join(dir, 'artist-overrides.json')
      const oldGroups = (): string => join(dir, 'artist-groups.json')
      const v1 = (path: string): string => path.replace(/\.json$/, '.v1.json')
      // the user's real file
      const users = JSON.stringify({
        version: 1,
        artists: {
          'sadness,alongmemories': ['Sadness'],
          'sadness,thelightisfadingaway': ['Sadness'],
          'sadness,dismalimerence': ['Sadness'],
          'magogaio/sadness': ['Magogaio', 'Sadness']
        }
      })
      const groups = JSON.stringify({
        version: 1,
        groups: { bjork: 'Björk', björk: 'Björk', 'magogaio/sadness': 'Magogaio' },
        asked: ['bjork', 'björk', 'magogaio/sadness']
      })
      const tags = [
        'Sadness, Along Memories',
        'Sadness, The Light Is Fading Away',
        'Sadness, Dismal Imerence',
        'Magogaio/Sadness',
        'Bjork',
        'Björk'
      ]
      const converted = {
        version: 1,
        artists: [
          artist('Magogaio', 'you', ['Magogaio/Sadness', 'you']),
          artist(
            'Sadness',
            'you',
            ['Sadness, Along Memories', 'you'],
            ['Sadness, The Light Is Fading Away', 'you'],
            ['Sadness, Dismal Imerence', 'you'],
            ['Magogaio/Sadness', 'you']
          ),
          artist('Björk', 'ai', ['Bjork', 'ai'], ['Björk', 'ai'])
        ]
      }
      async function expectSplits(): Promise<void> {
        const now = await songs()
        expect(now['Sadness, Along Memories'].artist).toBe('Sadness')
        expect(now['Sadness, Dismal Imerence'].artist).toBe('Sadness')
        expect(now['Magogaio/Sadness'].artists).toEqual(['Magogaio', 'Sadness'])
      }

      it("become artists.json at start, the user's splits still shown, and are renamed", async () => {
        index(tags)
        write(oldOverrides(), users)
        write(oldGroups(), groups)
        start(true, [], { 'artist-groups': true })
        await ready()
        await expectSplits()
        expect(await artistOf('Bjork')).toBe('Björk')
        expect(read(artistsPath())).toEqual(converted)
        expect(read(cachePath())).toEqual({
          version: 1,
          prompt: 2,
          split: [],
          joined: ['bjork', 'björk', 'magogaio/sadness'],
          checking: []
        })
        expect(existsSync(oldOverrides())).toBe(false)
        expect(existsSync(oldGroups())).toBe(false)
        expect(readFileSync(v1(oldOverrides()), 'utf8')).toBe(users)
        expect(readFileSync(v1(oldGroups()), 'utf8')).toBe(groups)

        // read once: a restart reads artists.json
        await boot()
        start(true, [], { 'artist-groups': true })
        await ready()
        await expectSplits()
      })

      it('with no index at start, wait for the first finished scan to get the spellings', async () => {
        // no library.json: the one song in the music folder is "Unknown artist"
        write(oldOverrides(), { version: 1, artists: { unknownartist: ['Nobody'] } })
        start(true)
        await ready()
        expect(existsSync(artistsPath())).toBe(false)
        expect(existsSync(oldOverrides())).toBe(true)
        scan(1)
        await until(() => scanned(1))
        send({ type: 'flush' })
        expect(read(artistsPath())).toEqual({
          version: 1,
          artists: [artist('Nobody', 'you', ['Unknown artist', 'you'])]
        })
        expect(existsSync(oldOverrides())).toBe(false)
        expect(existsSync(v1(oldOverrides()))).toBe(true)
      })

      it('with a broken artists.json, log that the old names stay in the .v1.json files', async () => {
        index(tags)
        write(artistsPath(), '{ broken')
        write(oldOverrides(), users)
        start(true)
        await ready()
        expect(readFileSync(v1(oldOverrides()), 'utf8')).toBe(users)
        expect(heard.some((m) => m.type === 'log' && m.text.includes('.v1.json files'))).toBe(true)
      })

      it('keeps a key no song has as its tag', async () => {
        index(['Kino'])
        write(oldOverrides(), { version: 1, artists: { gone: ['Gone Band'] } })
        start(true)
        await ready()
        expect(read(artistsPath())).toEqual({
          version: 1,
          artists: [artist('Gone Band', 'you', ['gone', 'you'])]
        })
      })

      it('are only renamed when artists.json is there already', async () => {
        index(tags)
        const mine = { version: 1, artists: [artist('Кино', 'you', ['Bjork', 'you'])] }
        write(artistsPath(), mine)
        write(oldOverrides(), users)
        start(true)
        await ready()
        expect(await artistOf('Bjork')).toBe('Кино')
        expect((await songs())['Sadness, Along Memories'].artist).toBe('Sadness, Along Memories')
        expect(read(artistsPath())).toEqual(mine)
        expect(existsSync(oldOverrides())).toBe(false)
        expect(readFileSync(v1(oldOverrides()), 'utf8')).toBe(users)
      })

      it('never replace a .v1.json there already: the old file stays, and it is logged', async () => {
        index(tags)
        write(oldOverrides(), users)
        write(v1(oldOverrides()), 'older')
        start(true)
        await ready()
        await expectSplits()
        expect(readFileSync(oldOverrides(), 'utf8')).toBe(users)
        expect(readFileSync(v1(oldOverrides()), 'utf8')).toBe('older')
        expect(heard.some((m) => m.type === 'log' && m.text.includes('is there already'))).toBe(
          true
        )
      })

      it('started off: shown, but nothing written or renamed until turned on', async () => {
        index(tags)
        write(oldOverrides(), users)
        start(false)
        await ready()
        await expectSplits()
        expect(existsSync(artistsPath())).toBe(false)
        expect(readFileSync(oldOverrides(), 'utf8')).toBe(users)
        send({ type: 'set-on', on: true })
        expect(read(artistsPath())).toMatchObject({ artists: converted.artists.slice(0, 2) })
        expect(existsSync(oldOverrides())).toBe(false)
        expect(readFileSync(v1(oldOverrides()), 'utf8')).toBe(users)
      })
    })
  })

  describe('genres from an older index (ticket 122)', () => {
    it('reads again only the files whose genre the older reader joined, then saves the new reader', async () => {
      // what a file on disk is, as the index keeps it
      const known = (name: string, comments: string[], more: object): object => {
        const path = join(music, name)
        writeFileSync(path, flacWith(comments))
        const st = statSync(path, { bigint: true })
        return { path, mtime: Number(st.mtimeMs), size: Number(st.size), duration: 10, ...more }
      }
      rmSync(join(music, 'a.mp3'))
      const files = [
        known('joined.flac', ['TITLE=Joined', 'GENRE=Rock', 'GENRE=Metal'], {
          title: 'Joined',
          genre: 'Rock, Metal'
        }),
        // read again, it would say "New title"
        known('plain.flac', ['TITLE=New title', 'GENRE=Ambient'], {
          title: 'Old title',
          genre: 'Ambient'
        })
      ]
      const ix = { ...(serializeIndex({ ...emptyIndex(), reader: 4 }) as object), files }
      writeFileSync(join(dir, 'library.json'), JSON.stringify(ix))
      start(true)
      scan(1)
      await until(() => scanned(1))
      send({ type: 'get-library', req: 2 })
      await until(() => heard.some((m) => m.type === 'reply' && m.req === 2))
      const m = heard.find((m) => m.type === 'reply' && m.req === 2) as { data: Uint8Array }
      const lib = JSON.parse(new TextDecoder().decode(m.data)) as {
        tracks: { title: string; genre?: string[] }[]
      }
      expect(lib.tracks.map((t) => [t.title, t.genre])).toEqual([
        ['Joined', ['Rock', 'Metal']],
        ['Old title', ['Ambient']]
      ])
      send({ type: 'flush' })
      const saved = JSON.parse(readFileSync(join(dir, 'library.json'), 'utf8'))
      expect(saved.reader).toBe(readerVersion)
      expect(saved.files.find((f: { title: string }) => f.title === 'Joined').genre).toEqual([
        'Rock',
        'Metal'
      ])
    })
  })

  describe("a song's words (ticket 120)", () => {
    async function words(id: string, req: number): Promise<unknown> {
      send({ type: 'lyrics', req, id })
      await until(() => heard.some((m) => m.type === 'reply' && m.req === req))
      return (heard.find((m) => m.type === 'reply' && m.req === req) as { lyrics?: unknown }).lyrics
    }

    it('reads them when asked, and the scan reads and keeps none', async () => {
      const song = join(music, '01 Song.flac')
      writeFileSync(song, flacWith(['TITLE=Song', 'LYRICS=From the tag']))
      writeFileSync(join(music, '01 Song.lrc'), '[00:01.00]From the file')
      start(true)
      scan(1)
      await until(() => scanned(1))
      send({ type: 'flush' })
      const index = readFileSync(join(dir, 'library.json'), 'utf8')
      expect(index).not.toContain('From the')
      expect(index).not.toContain('.lrc')
      expect(await words(shortHash(song), 2)).toEqual({ synced: [{ t: 1, text: 'From the file' }] })
      expect(await words('nope', 3)).toBeUndefined()
    })

    it("reads a CUE track's from an .lrc named after it, never the image's tags", async () => {
      const image = join(music, 'disc.flac')
      writeFileSync(image, flacWith(['LYRICS=The whole disc']))
      writeFileSync(
        join(music, 'disc.cue'),
        [
          'FILE "disc.flac" WAVE',
          '  TRACK 01 AUDIO',
          '    TITLE "First"',
          '    INDEX 01 00:00:00',
          '  TRACK 02 AUDIO',
          '    TITLE "Second"',
          '    INDEX 01 00:05:00'
        ].join('\n')
      )
      writeFileSync(join(music, '02 - Second.lrc'), 'Second words')
      start(true)
      scan(1)
      await until(() => scanned(1))
      expect(await words(cueTrackId(image, 2), 2)).toEqual({ plain: 'Second words' })
      expect(await words(cueTrackId(image, 1), 3)).toBeUndefined()
    })
  })

  describe('song info changed in Spindle (ticket 129)', () => {
    type Lib = {
      albums: { title: string; year: number }[]
      tracks: { id: string; album: string }[]
    }
    const decode = (b: Uint8Array): Lib => JSON.parse(new TextDecoder().decode(b))
    async function ask(
      m: WorkerIn & { req: number }
    ): Promise<Extract<WorkerOut, { type: 'reply' }>> {
      send(m)
      await until(() => heard.some((x) => x.type === 'reply' && x.req === m.req))
      return heard.find((x) => x.type === 'reply' && x.req === m.req) as Extract<
        WorkerOut,
        { type: 'reply' }
      >
    }
    const library = async (req: number): Promise<Lib> =>
      decode((await ask({ type: 'get-library', req })).data!)

    beforeEach(() => {
      rmSync(join(music, 'a.mp3'))
      writeFileSync(join(music, '1.flac'), flacWith(['TITLE=One', 'ALBUM=Blue Hours', 'DATE=1995']))
      writeFileSync(join(music, '2.flac'), flacWith(['TITLE=Two', 'ALBUM=Blue Hourz', 'DATE=1995']))
    })
    const one = (): string => shortHash(join(music, '1.flac'))
    const two = (): string => shortHash(join(music, '2.flac'))

    it('builds the library again with a change, no scan, and keeps it after a restart', async () => {
      start(true)
      scan(1)
      await until(() => scanned(1))
      expect((await library(2)).albums.map((a) => a.title).sort()).toEqual([
        'Blue Hours',
        'Blue Hourz'
      ])
      const tags = (await ask({ type: 'tag-values', req: 3, ids: [two(), 'gone'] })).tags!
      expect(Object.keys(tags)).toEqual([two()])
      expect(tags[two()].now).toMatchObject({ title: 'Two', album: 'Blue Hourz', year: 1995 })
      const r = await ask({
        type: 'fix-tags',
        req: 4,
        change: { edit: { ids: [two()], set: { album: 'Blue Hours', year: 1996 }, reset: [] } }
      })
      expect(r.before).toEqual({ [two()]: null })
      // the page gets the change as a patch
      await until(() => heard.some((m) => m.type === 'library'))
      const lib = await library(5)
      expect(lib.albums.map((a) => [a.title, a.year])).toEqual([['Blue Hours', 1996]])
      const now = (await ask({ type: 'tag-values', req: 6, ids: [two()] })).tags![two()]
      expect(now.now).toMatchObject({ album: 'Blue Hours', year: 1996 })
      expect(now.file).toMatchObject({ album: 'Blue Hourz', year: 1995 })
      send({ type: 'flush' })
      expect(JSON.parse(readFileSync(join(dir, 'tag-fixes.json'), 'utf8'))).toEqual({
        version: 1,
        fixes: { [`files:${two()}`]: { album: 'Blue Hours', year: 1996 } }
      })
      await boot()
      start(true)
      expect((await library(1)).albums.map((a) => a.title)).toEqual(['Blue Hours'])
      // Undo puts back what the song had
      await ask({ type: 'fix-tags', req: 2, change: { put: { [two()]: null } } })
      expect((await library(3)).albums).toHaveLength(2)
      expect(one()).not.toBe(two())
    })

    it('takes no change while off', async () => {
      start(true)
      scan(1)
      await until(() => scanned(1))
      send({ type: 'set-on', on: false })
      const r = await ask({
        type: 'fix-tags',
        req: 2,
        change: { edit: { ids: [two()], set: { year: 2001 }, reset: [] } }
      })
      expect(r.before).toEqual({})
      send({ type: 'flush' })
      expect(existsSync(join(dir, 'tag-fixes.json'))).toBe(false)
    })
  })

  describe('song info (ticket 127)', () => {
    async function ask(
      m: { type: 'song-info' | 'song-path'; id: string; sheet?: boolean },
      req: number
    ): Promise<{ info?: SongFileInfo; path?: string }> {
      send({ ...m, req })
      await until(() => heard.some((x) => x.type === 'reply' && x.req === req))
      return heard.find((x) => x.type === 'reply' && x.req === req) as {
        info?: SongFileInfo
        path?: string
      }
    }

    it("reads a song's file when asked, and its path; nothing for an id it doesn't know", async () => {
      const song = join(music, '01 Song.flac')
      writeFileSync(song, flacWith(['TITLE=Song', 'GENRE=Jazz']))
      start(true)
      scan(1)
      await until(() => scanned(1))
      const { info } = await ask({ type: 'song-info', id: shortHash(song) }, 2)
      expect(info).toMatchObject({ path: song, genre: ['Jazz'], format: { sampleRate: 44100 } })
      expect(info?.added).toBeGreaterThan(0)
      expect(info?.tags).toContainEqual({ type: 'vorbis', id: 'TITLE', value: 'Song' })
      expect((await ask({ type: 'song-path', id: shortHash(song) }, 3)).path).toBe(song)
      expect((await ask({ type: 'song-info', id: 'nope' }, 4)).info).toBeUndefined()
      // deleted after the scan
      rmSync(song)
      expect((await ask({ type: 'song-info', id: shortHash(song) }, 5)).info).toMatchObject({
        path: song,
        gone: true
      })
    })

    it("gives a CUE track's image, sheet and place", async () => {
      const image = join(music, 'disc.flac')
      writeFileSync(image, flacWith(['TITLE=Disc']))
      const sheet = join(music, 'disc.cue')
      writeFileSync(
        sheet,
        [
          'REM GENRE Ambient',
          'FILE "disc.flac" WAVE',
          '  TRACK 01 AUDIO',
          '    INDEX 01 00:00:00',
          '  TRACK 02 AUDIO',
          '    INDEX 01 00:05:00'
        ].join('\n')
      )
      start(true)
      scan(1)
      await until(() => scanned(1))
      const first = await ask({ type: 'song-info', id: cueTrackId(image, 1) }, 2)
      expect(first.info).toMatchObject({
        path: image,
        genre: ['Ambient'],
        cue: { sheet, start: 0, end: 5 }
      })
      const second = await ask({ type: 'song-info', id: cueTrackId(image, 2) }, 3)
      expect(second.info?.cue).toEqual({ sheet, start: 5 })
      const at = await ask({ type: 'song-path', id: cueTrackId(image, 2), sheet: true }, 4)
      expect(at.path).toBe(sheet)
    })
  })
})
