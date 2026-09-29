import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { BusyError, NetError } from './cover-http'
import {
  cleanSong,
  findSongCover,
  parseSongAnswer,
  pickSongs,
  songSearchUrl,
  stopsSongLookups,
  type SongHttp
} from './song-cover'

const fixture = (n: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', n), 'utf8'))
const trooper = { artist: 'Iron Maiden', song: 'The Trooper' }
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 1])
const both = { deezer: true, itunes: true }

describe('songSearchUrl', () => {
  it('asks Deezer with a plain search (its track: filter finds nothing)', () => {
    const u = new URL(songSearchUrl('deezer', { artist: 'AC/DC', song: 'T.N.T. "live"' }))
    expect(u.origin + u.pathname).toBe('https://api.deezer.com/search/track')
    expect(u.searchParams.get('q')).toBe('AC/DC T.N.T. live')
  })

  it('asks iTunes for songs', () => {
    const u = new URL(songSearchUrl('itunes', trooper))
    expect(u.origin + u.pathname).toBe('https://itunes.apple.com/search')
    expect(u.searchParams.get('entity')).toBe('song')
    expect(u.searchParams.get('term')).toBe('Iron Maiden The Trooper')
  })
})

describe('cleanSong', () => {
  it('drops edition, edit and feat brackets', () => {
    expect(cleanSong('The Trooper (1998 Remaster)')).toBe('the trooper')
    expect(cleanSong('One (Radio Edit)')).toBe('one')
    expect(cleanSong('Numb [feat. Someone]')).toBe('numb')
    expect(cleanSong('The Trooper (Live 2003)')).toBe('the trooper live')
    expect(cleanSong('The Trooper (Live at Donington; 1998 Remaster)')).toBe('the trooper live')
  })

  it('keeps "live" from a " - " suffix too', () => {
    expect(cleanSong('The Trooper - Live at Long Beach Arena; 1998 Remaster')).toBe(
      'the trooper live'
    )
    expect(cleanSong('The Trooper - Live Version')).toBe('the trooper live')
    expect(cleanSong('The Trooper - 2015 Remaster')).toBe('the trooper')
    // not the studio song
    const c = { image: 'https://x.dzcdn.net/1.jpg', rank: 0, artist: 'Iron Maiden' }
    expect(pickSongs(trooper, [{ ...c, song: 'The Trooper - Live Version' }])).toEqual([])
  })
})

describe('stopsSongLookups', () => {
  const all = { musicbrainz: true, deezer: true, itunes: true }
  it('stops running song lookups when the setting or any service is turned off', () => {
    const before = { on: true, sources: all }
    expect(stopsSongLookups(before, { on: false, sources: all })).toBe(true)
    expect(stopsSongLookups(before, { on: true, sources: { ...all, itunes: false } })).toBe(true)
    expect(stopsSongLookups(before, { on: true, sources: all })).toBe(false)
    // a service turned on takes nothing away
    const fewer = { on: true, sources: { ...all, deezer: false } }
    expect(stopsSongLookups(fewer, before)).toBe(false)
    expect(stopsSongLookups(undefined, before)).toBe(false)
  })
})

describe('parseSongAnswer on saved answers', () => {
  it('reads Deezer tracks with their album cover', () => {
    const c = parseSongAnswer('deezer', fixture('deezer-song.json'))
    expect(c[0]).toEqual({
      artist: 'Iron Maiden',
      song: 'The Trooper (1998 Remaster)',
      image: expect.stringMatching(/^https:\/\/cdn-images\.dzcdn\.net\/.*1000x1000/),
      rank: 0
    })
  })

  it('reads iTunes songs, marks compilations and asks for the big picture', () => {
    const c = parseSongAnswer('itunes', fixture('itunes-song.json'))
    expect(c[0].image).toMatch(/\/1200x1200bb\.jpg$/)
    expect(c[0].rank).toBe(0)
    // Stranger Things soundtrack, by Various Artists
    expect(c[1]).toMatchObject({ song: 'The Trooper', rank: 2 })
  })

  it('skips Deezer tracks with no art', () => {
    const json = {
      data: [
        {
          title: 'X',
          artist: { name: 'A' },
          album: { title: 'Y', cover_xl: 'https://e-cdns-images.dzcdn.net/images/cover//1.jpg' }
        }
      ]
    }
    expect(parseSongAnswer('deezer', json)).toEqual([])
  })
})

describe('pickSongs', () => {
  it('takes the studio song, not the live ones', () => {
    const found = pickSongs(trooper, parseSongAnswer('deezer', fixture('deezer-song.json')))
    expect(found.map((c) => c.song)).toEqual(['The Trooper (1998 Remaster)'])
  })

  it('puts a compilation after the artist’s own album', () => {
    const found = pickSongs(trooper, parseSongAnswer('itunes', fixture('itunes-song.json')))
    expect(found.map((c) => c.rank)).toEqual([0, 2])
    expect(found[0].image).toContain('0881034134455')
  })

  it('never takes another artist or another song', () => {
    const c = { image: 'https://x.dzcdn.net/1.jpg', rank: 0 }
    expect(pickSongs(trooper, [{ ...c, artist: 'Iron Maidens', song: 'The Trooper' }])).toEqual([])
    expect(pickSongs(trooper, [{ ...c, artist: 'Iron Maiden', song: 'Aces High' }])).toEqual([])
    // a joint credit holding ours is ours
    expect(
      pickSongs(trooper, [{ ...c, artist: 'Iron Maiden & Someone', song: 'The Trooper' }])
    ).toHaveLength(1)
  })
})

// The services: an answer by url, or an Error to throw.
function http(
  answers: (url: string) => unknown,
  image: (url: string) => Uint8Array | undefined | Error = () => jpeg
): SongHttp & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    json: async (url, limiter) => {
      calls.push(`${limiter} ${new URL(url).hostname}`)
      const a = answers(url)
      if (a instanceof Error) throw a
      return a
    },
    image: async (url, limiter) => {
      calls.push(`${limiter} image`)
      const r = image(url)
      if (r instanceof Error) throw r
      return r
    }
  }
}
const deezerAnswer = fixture('deezer-song.json')
const itunesAnswer = fixture('itunes-song.json')
const signal = new AbortController().signal

describe('findSongCover', () => {
  it('takes Deezer’s picture when it has the song, and asks iTunes nothing', async () => {
    const h = http((u) => (u.includes('deezer') ? deezerAnswer : itunesAnswer))
    const r = await findSongCover(h, both, trooper, signal)
    expect(r).toEqual({ data: jpeg, source: 'deezer' })
    expect(h.calls).toEqual(['deezer api.deezer.com', 'deezer image'])
  })

  it('asks iTunes when Deezer has nothing that matches', async () => {
    const h = http((u) => (u.includes('deezer') ? { data: [] } : itunesAnswer))
    const r = await findSongCover(h, both, trooper, signal)
    expect(r).toEqual({ data: jpeg, source: 'itunes' })
  })

  it('is not found when every service answered with nothing', async () => {
    const h = http(() => ({ data: [], results: [] }))
    expect(await findSongCover(h, both, trooper, signal)).toBe('none')
  })

  it('skips a service that is switched off', async () => {
    const h = http((u) => (u.includes('deezer') ? deezerAnswer : itunesAnswer))
    const r = await findSongCover(h, { deezer: false, itunes: true }, trooper, signal)
    expect(r).toEqual({ data: jpeg, source: 'itunes' })
    expect(h.calls.some((c) => c.startsWith('deezer'))).toBe(false)
  })

  it('asks nothing with both services off', async () => {
    const h = http(() => deezerAnswer)
    expect(await findSongCover(h, { deezer: false, itunes: false }, trooper, signal)).toBe('later')
    expect(h.calls).toEqual([])
  })

  it('is "later", not "none", when a service failed or was busy', async () => {
    const off = http((u) => (u.includes('deezer') ? new NetError('x') : { results: [] }))
    expect(await findSongCover(off, both, trooper, signal)).toBe('later')
    const busy = http((u) => (u.includes('deezer') ? { data: [] } : new BusyError('429')))
    expect(await findSongCover(busy, both, trooper, signal)).toBe('later')
    // Deezer reports a quota in a 200 answer
    const quota = http((u) => (u.includes('deezer') ? { error: { code: 4 } } : { results: [] }))
    expect(await findSongCover(quota, both, trooper, signal)).toBe('later')
  })

  it('tries the next match when a picture is not there', async () => {
    let n = 0
    const h = http(
      () => itunesAnswer,
      () => (n++ === 0 ? undefined : jpeg)
    )
    const r = await findSongCover(h, { deezer: false, itunes: true }, trooper, signal)
    expect(r).toEqual({ data: jpeg, source: 'itunes' })
    expect(h.calls.filter((c) => c.endsWith('image'))).toHaveLength(2)
  })

  it('stops at once when aborted', async () => {
    const stop = new AbortController()
    stop.abort()
    const h = http(() => deezerAnswer)
    await expect(findSongCover(h, both, trooper, stop.signal)).rejects.toThrow()
    expect(h.calls).toEqual([])
  })
})
