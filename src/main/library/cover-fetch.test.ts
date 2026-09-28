import { describe, expect, it, vi } from 'vitest'
import { CoverFetcher, publishGapMs, type FetcherDeps } from './cover-fetch'
import { BusyError, NetError } from './cover-http'
import { searchKey, type CoverQuery } from './cover-match'
import type { Fetched } from './fetched-store'

const all = { musicbrainz: true, deezer: true, itunes: true }
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 1])
const h = 'c'.repeat(40)
const rg = 'f5093c06-23e3-404f-aeaa-40f72885ee3a'
const q = (id: string, more: Partial<CoverQuery> = {}): CoverQuery => ({
  albumId: id,
  artist: 'The Beatles',
  album: 'Abbey Road',
  year: 1969,
  tracks: 17,
  compilation: false,
  noArtist: false,
  key: searchKey('The Beatles', 'Abbey Road'),
  ...more
})
const deezerHit = {
  data: [
    {
      title: 'Abbey Road',
      artist: { name: 'The Beatles' },
      nb_tracks: 17,
      cover_xl: 'https://cdn-images.dzcdn.net/1.jpg'
    }
  ]
}
const nothing = { data: [], results: [], 'release-groups': [] }
const itunesHit = {
  results: [
    {
      collectionName: 'Abbey Road',
      artistName: 'The Beatles',
      trackCount: 17,
      artworkUrl100: 'https://is1-ssl.mzstatic.com/x/100x100bb.jpg'
    }
  ]
}

// json and image stand in for the services: return an answer, or an Error to throw.
function setup(
  json: (url: string) => unknown,
  image: (url: string) => Uint8Array | undefined = () => jpeg
): { f: CoverFetcher; d: FetcherDeps; fetched: Fetched; calls: string[] } {
  let t = 0
  const fetched: Fetched = new Map()
  const cached = new Set<string>()
  const calls: string[] = []
  const d: FetcherDeps = {
    http: {
      json: async (url) => {
        calls.push(url)
        const r = json(url)
        if (r instanceof Error) throw r
        return r
      },
      image: async (url) => {
        calls.push(url)
        return image(url)
      }
    },
    addCover: async () => {
      cached.add(h)
      return { hash: h, ok: true }
    },
    hasCover: (x) => cached.has(x),
    fetched,
    changed: vi.fn(),
    status: vi.fn(),
    now: () => t,
    // the 5 minute wait lasts until stopped, so an offline loop doesn't spin
    sleep: vi.fn(
      (ms: number, signal: AbortSignal) =>
        new Promise<void>((resolve) => {
          if (ms < 300000) {
            t += ms
            return resolve()
          }
          signal.addEventListener('abort', () => resolve(), { once: true })
        })
    ),
    log: () => {}
  }
  return { f: new CoverFetcher(d), d, fetched, calls }
}

describe('CoverFetcher', () => {
  it('sends nothing while off, even with albums to look up and no scan', async () => {
    const { f, calls } = setup(() => deezerHit)
    f.setQueries([q('a')])
    f.release()
    await f.idle
    expect(calls).toEqual([])
  })

  it('sends nothing while held (a scan runs), then starts when released', async () => {
    const { f, calls } = setup(() => deezerHit)
    f.setOptions(true, all)
    f.setQueries([q('a')])
    await f.idle
    expect(calls).toEqual([])
    f.release()
    await f.idle
    expect(calls.length).toBeGreaterThan(0)
  })

  it('stores the first accepted match and asks no one else', async () => {
    const { f, fetched, calls, d } = setup((u) => (u.includes('deezer') ? deezerHit : nothing))
    f.setOptions(true, all)
    f.setQueries([q('a')])
    f.release()
    await f.idle
    expect(fetched.get('a')).toMatchObject({ hash: h, source: 'deezer', key: q('a').key })
    expect(calls.some((u) => u.includes('itunes') || u.includes('musicbrainz'))).toBe(false)
    expect(d.changed).toHaveBeenCalledWith(true)
    expect(d.status).toHaveBeenLastCalledWith({ found: 1, notFound: 0, left: 0, running: false })
  })

  it('tries the MusicBrainz id first, and falls through to the searches on a 404', async () => {
    const { f, fetched, calls } = setup(
      () => deezerHit,
      (u) => (u.includes('coverartarchive') ? undefined : jpeg)
    )
    f.setOptions(true, all)
    f.setQueries([q('a', { mbReleaseGroup: rg })])
    f.release()
    await f.idle
    expect(calls[0]).toBe(`https://coverartarchive.org/release-group/${rg}/front-1200`)
    expect(fetched.get('a')?.source).toBe('deezer')
  })

  it('takes the MusicBrainz id when its picture is there', async () => {
    const { f, fetched, calls } = setup(() => deezerHit)
    f.setOptions(true, all)
    f.setQueries([q('a', { mbRelease: rg })])
    f.release()
    await f.idle
    expect(calls).toEqual([`https://coverartarchive.org/release/${rg}/front-1200`])
    expect(fetched.get('a')?.source).toBe('musicbrainz')
  })

  it('skips switched-off sources and stores not found when nothing matched', async () => {
    const { f, fetched, calls } = setup(() => nothing)
    f.setOptions(true, { musicbrainz: false, deezer: false, itunes: true })
    f.setQueries([q('a', { mbReleaseGroup: rg })])
    f.release()
    await f.idle
    expect(calls.length).toBe(1)
    expect(calls[0]).toContain('itunes.apple.com')
    expect(fetched.get('a')).toMatchObject({ source: 'none', key: q('a').key })
  })

  it('stores nothing while offline, and waits 5 minutes', async () => {
    const { f, fetched, d } = setup(() => new NetError('offline'))
    f.setOptions(true, all)
    f.setQueries([q('a')])
    f.release()
    await vi.waitFor(() => expect(d.sleep).toHaveBeenCalledWith(300000, expect.anything()))
    f.setOptions(false, all)
    await f.idle
    expect(fetched.has('a')).toBe(false)
  })

  it('asks the other services when one fails, and keeps what they find', async () => {
    const { f, fetched } = setup((u) =>
      u.includes('deezer') ? new NetError('blocked') : u.includes('itunes') ? itunesHit : nothing
    )
    f.setOptions(true, all)
    f.setQueries([q('a')])
    f.release()
    await f.idle
    expect(fetched.get('a')?.source).toBe('itunes')
  })

  it('stores nothing when a service failed and the others found nothing, and goes on', async () => {
    const { f, fetched, calls, d } = setup((u) =>
      u.includes('deezer') ? new BusyError('429') : nothing
    )
    f.setOptions(true, all)
    f.setQueries([q('a'), q('b', { album: 'Help', key: searchKey('The Beatles', 'Help') })])
    f.release()
    await f.idle
    expect(fetched.size).toBe(0)
    // both albums were asked for, with no 5 minute wait in between
    expect(calls.filter((u) => u.includes('itunes'))).toHaveLength(2)
    expect(d.sleep).not.toHaveBeenCalledWith(300000, expect.anything())
  })

  it('counts a Deezer error answer as no answer, not as not found', async () => {
    const { f, fetched } = setup((u) => (u.includes('deezer') ? { error: { code: 4 } } : nothing))
    f.setOptions(true, all)
    f.setQueries([q('a')])
    f.release()
    await f.idle
    expect(fetched.has('a')).toBe(false)
  })

  it('looks the album up again on the next run after a 429, storing nothing for it', async () => {
    let n = 0
    const { f, fetched } = setup((u) =>
      u.includes('deezer') ? (n++ === 0 ? new BusyError('429') : deezerHit) : nothing
    )
    f.setOptions(true, all)
    f.setQueries([q('a')])
    f.release()
    await f.idle
    expect(fetched.has('a')).toBe(false)
    f.setQueries([q('a')])
    await f.idle
    expect(fetched.get('a')?.source).toBe('deezer')
  })

  it('does not ask again for a picture that was not there, when the album is retried', async () => {
    let n = 0
    const { f, calls } = setup(
      (u) => (u.includes('deezer') ? (n++ === 0 ? new BusyError('429') : deezerHit) : nothing),
      (u) => (u.includes('coverartarchive') ? undefined : jpeg)
    )
    f.setOptions(true, all)
    f.setQueries([q('a', { mbReleaseGroup: rg })])
    f.release()
    await f.idle
    f.setQueries([q('a', { mbReleaseGroup: rg })])
    await f.idle
    expect(calls.filter((u) => u.includes('coverartarchive'))).toHaveLength(1)
  })

  it('stops before the next request when turned off', async () => {
    const { f, calls } = setup(() => deezerHit)
    f.setOptions(true, all)
    f.setQueries([q('a'), q('b', { album: 'Help', key: searchKey('The Beatles', 'Help') })])
    f.release()
    f.setOptions(false, all)
    await f.idle
    expect(calls).toEqual([])
  })

  it('skips an album with a fresh result, and looks again when its names change', async () => {
    const { f, fetched, calls } = setup(() => nothing)
    fetched.set('a', { source: 'none', at: 0, key: q('a').key })
    f.setOptions(true, all)
    f.setQueries([q('a')])
    f.release()
    await f.idle
    expect(calls).toEqual([])
    f.setQueries([q('a', { key: searchKey('The Beatles', 'Abbey Road Sessions') })])
    await f.idle
    expect(calls.length).toBeGreaterThan(0)
  })

  it('only takes the MusicBrainz id for an album with no artist', async () => {
    const { f, calls, fetched } = setup(
      () => deezerHit,
      () => undefined
    )
    f.setOptions(true, all)
    f.setQueries([q('a', { noArtist: true, artist: 'Unknown artist' })])
    f.release()
    await f.idle
    expect(calls).toEqual([])
    expect(fetched.get('a')?.source).toBe('none')
  })

  it('counts two albums with one picture as found each', async () => {
    const { f, fetched } = setup(() => deezerHit)
    f.setOptions(true, all)
    f.setQueries([q('a'), q('b')])
    f.release()
    await f.idle
    expect(fetched.get('a')?.hash).toBe(h)
    expect(fetched.get('b')?.hash).toBe(h)
  })

  it('tries the next result when a picture does not decode', async () => {
    const two = {
      data: [
        { ...deezerHit.data[0], cover_xl: 'https://cdn-images.dzcdn.net/bad.jpg' },
        deezerHit.data[0]
      ]
    }
    const { f, d, fetched } = setup(() => two)
    const ok = d.addCover
    d.addCover = async (data) => (data === jpeg ? { hash: 'b'.repeat(40), ok: false } : ok(data))
    let first = true
    d.http.image = async () => {
      const r = first ? jpeg : new Uint8Array([0xff, 0xd8, 0xff, 2])
      first = false
      return r
    }
    f.setOptions(true, all)
    f.setQueries([q('a')])
    f.release()
    await f.idle
    expect(fetched.get('a')?.source).toBe('deezer')
  })

  it('looks an album up once per run, even if its cover is gone from the cache at once', async () => {
    const { f, d, calls } = setup(() => deezerHit)
    d.addCover = async () => ({ hash: h, ok: true })
    f.setOptions(true, all)
    f.setQueries([q('a')])
    f.release()
    await f.idle
    expect(calls.filter((u) => u.includes('deezer.com'))).toHaveLength(1)
  })

  it('looks up 5 albums at a time', async () => {
    const { f, d, fetched } = setup(() => deezerHit)
    let now = 0
    let most = 0
    const answers: (() => void)[] = []
    d.http.json = async () => {
      now++
      most = Math.max(most, now)
      await new Promise<void>((r) => answers.push(r))
      now--
      return deezerHit
    }
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    f.setOptions(true, all)
    f.setQueries(ids.map((id) => q(id)))
    f.release()
    await vi.waitFor(() => expect(answers).toHaveLength(5))
    while (answers.length) {
      answers.shift()!()
      await new Promise((r) => setTimeout(r, 0))
    }
    await f.idle
    expect(most).toBe(5)
    expect(ids.every((id) => fetched.get(id)?.source === 'deezer')).toBe(true)
  })

  it('waits the 5 minutes once for all albums when offline, and logs it once', async () => {
    const { f, d } = setup(() => new NetError('offline'))
    const log = vi.fn()
    d.log = log
    f.setOptions(true, all)
    f.setQueries(['a', 'b', 'c'].map((id) => q(id)))
    f.release()
    await vi.waitFor(() => expect(d.sleep).toHaveBeenCalledWith(300000, expect.anything()))
    await new Promise((r) => setTimeout(r, 10))
    f.setOptions(false, all)
    await f.idle
    expect(vi.mocked(d.sleep).mock.calls.filter(([ms]) => ms === 300000)).toHaveLength(1)
    expect(log).toHaveBeenCalledTimes(1)
  })

  it('looks up misses again when a source is turned on', () => {
    const { f, fetched, d } = setup(() => nothing)
    fetched.set('a', { source: 'none', at: 0, key: q('a').key })
    f.setOptions(true, { musicbrainz: true, deezer: true, itunes: false })
    expect(fetched.has('a')).toBe(true)
    f.setOptions(true, all)
    expect(fetched.has('a')).toBe(false)
    expect(d.changed).toHaveBeenCalledWith(false)
  })
})

describe('publishGapMs', () => {
  it('shows found covers every 2s in a small library, and less often in a big one', () => {
    expect(publishGapMs(300)).toBe(2000)
    expect(publishGapMs(8000)).toBe(2000)
    expect(publishGapMs(20000)).toBe(5000)
    expect(publishGapMs(40000)).toBe(10000)
    expect(publishGapMs(200000)).toBe(10000)
  })
})
