import { describe, expect, it } from 'vitest'
import type { Art } from '../../shared/library'
import { shortHash } from './ids'
import type { MfpEpisode } from './mfp'
import { mfpLibrary } from './mfp-library'

const art = (id: string): Art => ({
  palette: { dark: [id, id, id], light: [id, id, id] },
  cover: 'spindle://cover/small/x',
  coverLarge: 'spindle://cover/large/x'
})

function episode(over: Partial<MfpEpisode> = {}): MfpEpisode {
  return {
    slug: 'seventynine',
    number: 79,
    title: '79: Corticyte',
    artist: 'Corticyte',
    url: 'https://datashat.net/music_for_programming_79-corticyte.mp3',
    bytes: 441077163,
    duration: 3600,
    date: '2026-08-24T17:18:00Z',
    tracks: [
      { artist: 'A', title: 'One' },
      { artist: 'B', title: 'Two' },
      { artist: '', title: 'Three' }
    ],
    link: 'https://musicforprogramming.net/seventynine',
    ...over
  }
}

describe('mfpLibrary', () => {
  it('makes one album per episode with its songs spread evenly over the mp3', () => {
    const { albums, tracks } = mfpLibrary([episode()], art)
    const file = shortHash('mfp:https://datashat.net/music_for_programming_79-corticyte.mp3')
    expect(albums).toHaveLength(1)
    expect(albums[0]).toMatchObject({
      id: shortHash('mfp:seventynine'),
      title: '79: Corticyte',
      artist: 'Corticyte',
      year: 2026,
      online: 'mfp',
      link: 'https://musicforprogramming.net/seventynine',
      trackIds: tracks.map((t) => t.id)
    })
    expect(tracks.map((t) => t.part)).toEqual([
      { file, start: 0, end: 1200 },
      { file, start: 1200, end: 2400 },
      { file, start: 2400 }
    ])
    expect(tracks.map((t) => t.duration)).toEqual([1200, 1200, 1200])
  })

  it('fills each song from its row', () => {
    const t = mfpLibrary([episode()], art).tracks
    expect(t[1]).toMatchObject({
      id: shortHash('mfp:seventynine#1'),
      title: 'Two',
      artist: 'B',
      album: '79: Corticyte',
      albumId: shortHash('mfp:seventynine'),
      no: 2,
      disc: 1,
      codec: 'MPEG 1 Layer 3',
      folder: -1,
      online: 'mfp'
    })
  })

  it('gives a row with no artist the episode artist', () => {
    expect(mfpLibrary([episode()], art).tracks[2].artist).toBe('Corticyte')
  })

  it('gives the album the art for its id', () => {
    const al = mfpLibrary([episode()], art).albums[0]
    expect(al.palette.dark[0]).toBe(al.id)
    expect(al.cover).toBe('spindle://cover/small/x')
  })

  it('makes one whole-file song for an episode with no tracklist or no length', () => {
    for (const e of [episode({ tracks: [] }), episode({ duration: 0 })]) {
      const { tracks } = mfpLibrary([e], art)
      expect(tracks).toHaveLength(1)
      expect(tracks[0]).toMatchObject({ title: '79: Corticyte', artist: 'Corticyte', no: 1 })
      expect(tracks[0].part).toEqual({ file: shortHash(`mfp:${e.url}`), start: 0 })
    }
  })

  it('keeps the episodes in the order given, and lists their mp3s by file id', () => {
    const two = episode({ slug: 'two', number: 2, title: '02: X', url: 'https://a.net/2.mp3' })
    const { albums, urls } = mfpLibrary([episode(), two], art)
    expect(albums.map((a) => a.title)).toEqual(['79: Corticyte', '02: X'])
    expect(urls.get(shortHash('mfp:https://a.net/2.mp3'))).toEqual({
      url: 'https://a.net/2.mp3',
      duration: 3600
    })
  })

  it('gives year 0 for an episode with no date', () => {
    expect(mfpLibrary([episode({ date: null })], art).albums[0].year).toBe(0)
  })
})
