import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LyricsSong } from '../shared/lyrics'
import type { ItemKey } from '../shared/plugins/items'
import type { LyricsAsk } from './lyrics'
import {
  LyricsFetch,
  gapMs,
  lookupOf,
  lookupUrl,
  lyricsFileName,
  noneMs,
  readAnswer,
  type FetchLike
} from './lyrics-fetch'

const song: LyricsSong = {
  artist: 'Queen',
  title: 'Bohemian Rhapsody (Remastered 2011)',
  album: 'A Night at the Opera',
  duration: 354.6
}
// any plugin's song: the lookup goes by its name, not its key
const key = 'any:a' as ItemKey
const ask = (s: LyricsSong = song): LyricsAsk => ({ key, song: s })
const synced = '[00:01.00]Is this the real life?\n[00:05.50]Is this just fantasy?'
const answer = (o: Record<string, unknown> = {}): Record<string, unknown> => ({
  trackName: 'Bohemian Rhapsody',
  artistName: 'Queen',
  duration: 355,
  instrumental: false,
  plainLyrics: 'Is this the real life?\nIs this just fantasy?',
  syncedLyrics: synced,
  ...o
})
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const notFound = (): Response =>
  json({ message: 'Failed to find specified track', name: 'TrackNotFound', statusCode: 404 }, 404)

let dir: string
let now: number
let on: boolean
let urls: string[]
let replies: (() => Response | Promise<Response>)[]
let slept: number[]
let logs: string[]
let whileAsleep: () => void

const fakeFetch: FetchLike = async (url) => {
  urls.push(url)
  const r = replies.shift()
  if (!r) throw new Error('no reply set')
  return r()
}

function make(): LyricsFetch {
  return new LyricsFetch({
    dir,
    on: () => on,
    fetch: fakeFetch,
    userAgent: 'Spindle/test',
    now: () => now,
    sleep: async (ms, signal) => {
      signal.throwIfAborted()
      slept.push(ms)
      now += ms
      whileAsleep()
    },
    log: (t) => logs.push(t)
  })
}
const live = (): AbortSignal => new AbortController().signal

beforeEach(() => {
  dir = join(mkdtempSync(join(tmpdir(), 'spindle-lyrics-')), 'fetched-lyrics')
  now = 1_800_000_000_000
  on = true
  urls = []
  replies = []
  slept = []
  logs = []
  whileAsleep = () => {}
})
afterEach(() => rmSync(join(dir, '..'), { recursive: true, force: true }))

const kept = (): string[] => {
  try {
    return readdirSync(dir).map((n) => n.replace(/^[0-9a-f]{40}/, ''))
  } catch {
    return []
  }
}

describe('what is sent', () => {
  it('sends the artist, the title without edition words and the length, no album', () => {
    const look = lookupOf(song)!
    expect(look).toEqual({ artist: 'Queen', title: 'Bohemian Rhapsody' })
    expect(lookupUrl(look.artist, look.title, song.duration)).toBe(
      'https://lrclib.net/api/get?artist_name=Queen&track_name=Bohemian+Rhapsody&duration=355'
    )
    // no length known: none sent
    expect(lookupUrl('A', 'B & C', 0)).toBe(
      'https://lrclib.net/api/get?artist_name=A&track_name=B+%26+C'
    )
  })

  it('asks nothing for a song with no artist or title', () => {
    expect(lookupOf({ ...song, artist: 'Unknown artist' })).toBeUndefined()
    expect(lookupOf({ ...song, artist: ' ' })).toBeUndefined()
    expect(lookupOf({ ...song, title: '' })).toBeUndefined()
  })

  it('keeps one file name for the same song however it is written', () => {
    const a = lyricsFileName('The Beatles', 'Help! (Remastered)', 138.4)
    expect(a).toBe(lyricsFileName('Beatles', 'help', 138))
    expect(a).not.toBe(lyricsFileName('Beatles', 'help', 140))
    expect(a).toMatch(/^[0-9a-f]{40}$/)
  })
})

describe('readAnswer', () => {
  it('takes synced words over plain ones', () => {
    expect(readAnswer(answer(), 355)).toMatchObject({ kind: 'lrc', text: synced })
    expect(readAnswer(answer({ syncedLyrics: null }), 355)).toEqual({
      kind: 'txt',
      text: 'Is this the real life?\nIs this just fantasy?',
      lyrics: { plain: 'Is this the real life?\nIs this just fantasy?' }
    })
    // synced text with no stamps: the plain words
    expect(readAnswer(answer({ syncedLyrics: 'oops' }), 355)?.kind).toBe('txt')
  })

  it('drops a version more than 5 s longer or shorter', () => {
    expect(readAnswer(answer({ duration: 361 }), 355)).toBeUndefined()
    expect(readAnswer(answer({ duration: 349 }), 355)).toBeUndefined()
    expect(readAnswer(answer({ duration: 360 }), 355)).toBeDefined()
    // our length unknown: no check
    expect(readAnswer(answer({ duration: 100 }), 0)).toBeDefined()
  })

  it('says instrumental, and nothing for no words', () => {
    expect(
      readAnswer(answer({ instrumental: true, plainLyrics: null, syncedLyrics: null }), 355)
    ).toEqual({ kind: 'instrumental', text: '', lyrics: { instrumental: true } })
    expect(readAnswer(answer({ plainLyrics: ' ', syncedLyrics: null }), 355)).toBeUndefined()
    expect(readAnswer('nope', 355)).toBeUndefined()
    expect(readAnswer(null, 355)).toBeUndefined()
  })
})

describe('LyricsFetch', () => {
  it('sends nothing while off, from start on', async () => {
    on = false
    const f = make()
    expect(await f.get(ask(), live())).toBeUndefined()
    expect(await f.get(ask({ ...song, title: 'Another' }), live())).toBeUndefined()
    expect(urls).toEqual([])
    expect(kept()).toEqual([])
  })

  it('asks once per song: the answer is kept, and read back by a new start', async () => {
    replies.push(() => json(answer()))
    const f = make()
    const got = await f.get(ask(), live())
    expect(got).toEqual({
      synced: [
        { t: 1, text: 'Is this the real life?' },
        { t: 5.5, text: 'Is this just fantasy?' }
      ]
    })
    expect(urls).toHaveLength(1)
    expect(kept()).toEqual(['.lrc'])
    expect(readFileSync(join(dir, readdirSync(dir)[0]), 'utf8')).toBe(synced)
    expect(await f.get(ask(), live())).toEqual(got)
    // kept words show even with the switch off, as fetched covers do
    on = false
    expect(await make().get(ask(), live())).toEqual(got)
    expect(urls).toHaveLength(1)
  })

  it('keeps plain words and instrumental songs', async () => {
    replies.push(() => json(answer({ syncedLyrics: null })))
    replies.push(() => json(answer({ instrumental: true, syncedLyrics: null, plainLyrics: null })))
    const f = make()
    expect(await f.get(ask(), live())).toEqual({
      plain: 'Is this the real life?\nIs this just fantasy?'
    })
    const tune = { ...song, title: 'God Save the Queen' }
    expect(await f.get(ask(tune), live())).toEqual({ instrumental: true })
    expect(await f.get(ask(tune), live())).toEqual({ instrumental: true })
    expect(urls).toHaveLength(2)
    expect(kept().sort()).toEqual(['.instrumental', '.txt'])
  })

  it('keeps "not found" for 30 days, then asks again', async () => {
    replies.push(notFound)
    const f = make()
    expect(await f.get(ask(), live())).toBeUndefined()
    expect(kept()).toEqual(['.none'])
    now += noneMs - 1000
    expect(await f.get(ask(), live())).toBeUndefined()
    expect(urls).toHaveLength(1)
    now += 2000
    replies.push(() => json(answer()))
    expect(await f.get(ask(), live())).toBeDefined()
    expect(urls).toHaveLength(2)
    // the words took the miss's place
    expect(kept()).toEqual(['.lrc'])
  })

  it('keeps a version of another length as not found', async () => {
    replies.push(() => json(answer({ duration: 420 })))
    const f = make()
    expect(await f.get(ask(), live())).toBeUndefined()
    expect(kept()).toEqual(['.none'])
  })

  it('offline is not "not found": nothing kept, asked again next time', async () => {
    replies.push(() => Promise.reject(new TypeError('net::ERR_INTERNET_DISCONNECTED')))
    replies.push(() => new Response('<html>sign in to Wi-Fi</html>', { status: 200 }))
    replies.push(() => new Response('', { status: 502 }))
    const f = make()
    for (let i = 0; i < 3; i++) expect(await f.get(ask(), live())).toBeUndefined()
    expect(urls).toHaveLength(3)
    expect(kept()).toEqual([])
    expect(logs).toHaveLength(3)
    replies.push(() => json(answer()))
    expect(await f.get(ask(), live())).toBeDefined()
  })

  it('backs off on 429: no request for a minute, then two, back to normal after an answer', async () => {
    const other = (n: number): LyricsSong => ({ ...song, title: `Song ${n}` })
    replies.push(() => new Response('', { status: 429 }))
    const f = make()
    expect(await f.get(ask(other(1)), live())).toBeUndefined()
    // while backing off a song is not waited for: it is asked next time
    now += 30_000
    expect(await f.get(ask(other(2)), live())).toBeUndefined()
    expect(urls).toHaveLength(1)
    now += 31_000
    replies.push(() => new Response('', { status: 429 }))
    expect(await f.get(ask(other(3)), live())).toBeUndefined()
    expect(urls).toHaveLength(2)
    now += 61_000
    expect(await f.get(ask(other(4)), live())).toBeUndefined()
    expect(urls).toHaveLength(2)
    now += 60_000
    replies.push(notFound)
    expect(await f.get(ask(other(5)), live())).toBeUndefined()
    expect(urls).toHaveLength(3)
    // back to the normal gap
    replies.push(notFound)
    await f.get(ask(other(6)), live())
    expect(slept).toEqual([gapMs])
    expect(kept()).toEqual(['.none', '.none'])
  })

  it('sends one at a time, a gap apart, and none for a song skipped while it waits', async () => {
    let answerFirst!: (r: Response) => void
    replies.push(() => new Promise<Response>((r) => (answerFirst = r)))
    replies.push(notFound)
    const f = make()
    const first = f.get(ask(), live())
    const skipped = new AbortController()
    const second = f.get(ask({ ...song, title: 'Skipped' }), skipped.signal)
    const third = f.get(ask({ ...song, title: 'Third' }), live())
    await new Promise((r) => setTimeout(r, 5))
    expect(urls).toHaveLength(1)
    skipped.abort()
    answerFirst(json(answer()))
    expect(await first).toBeDefined()
    await expect(second).rejects.toThrow()
    expect(await third).toBeUndefined()
    expect(urls).toHaveLength(2)
    expect(urls[1]).toContain('track_name=Third')
  })

  it('keeps an answer that comes after its song was changed', async () => {
    const f = make()
    const stop = new AbortController()
    const p = f.get(ask(), stop.signal)
    stop.abort()
    await expect(p).rejects.toThrow()
    expect(urls).toHaveLength(0)
    // sent, then the song changed: kept for next time
    const later = new AbortController()
    replies.push(() => {
      later.abort()
      return json(answer())
    })
    expect(await f.get(ask(), later.signal)).toBeUndefined()
    expect(kept()).toEqual(['.lrc'])
  })

  it('stops before sending when turned off while waiting', async () => {
    replies.push(notFound)
    const f = make()
    await f.get(ask({ ...song, title: 'One' }), live())
    whileAsleep = () => (on = false)
    expect(await f.get(ask({ ...song, title: 'Two' }), live())).toBeUndefined()
    expect(slept).toEqual([gapMs])
    expect(urls).toHaveLength(1)
  })

  it('asks nothing for a song with no name, nor with none at all', async () => {
    const f = make()
    expect(await f.get(ask({ ...song, artist: 'Unknown artist' }), live())).toBeUndefined()
    expect(await f.get({ key }, live())).toBeUndefined()
    expect(urls).toEqual([])
  })

  it('sends its user agent and reads a broken kept file as nothing', async () => {
    let init: RequestInit | undefined
    const f = new LyricsFetch({
      dir,
      on: () => true,
      fetch: async (_u, i) => ((init = i), json(answer())),
      userAgent: 'Spindle/test'
    })
    const look = lookupOf(song)!
    const name = lyricsFileName(look.artist, look.title, song.duration)
    // only stamps, no words: asked again
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${name}.lrc`), '[00:01.00]')
    expect(await f.get(ask(), live())).toBeDefined()
    expect(init?.headers).toEqual({ 'User-Agent': 'Spindle/test' })
  })
})
