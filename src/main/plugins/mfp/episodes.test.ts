import { describe, expect, it } from 'vitest'
import { episodeId, pageEpisode, songId } from './episodes'
import type { MfpEpisode } from './site'

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

describe('episode ids', () => {
  // what the library gave them before ticket 061: shortHash of "mfp:<slug>"
  // and "mfp:<slug>#<row>"; saved queues and playlists hold these
  it('are the ones episodes and songs had as library albums and tracks', () => {
    expect(episodeId('seventynine')).toBe('4f8beeb7f1bfa5dc')
    expect(songId('seventynine', 0)).toBe('3c948f9d8683061f')
    expect(songId('seventynine', 1)).toBe('39cb55e487f710b0')
  })
})

describe('pageEpisode', () => {
  it('spreads the songs evenly over the mp3', () => {
    const e = pageEpisode(episode())
    expect(e).toMatchObject({
      id: episodeId('seventynine'),
      title: '79: Corticyte',
      artist: 'Corticyte',
      year: 2026,
      link: 'https://musicforprogramming.net/seventynine',
      length: 3600
    })
    expect(e.songs.map((s) => [s.start, s.end, s.length])).toEqual([
      [0, 1200, 1200],
      [1200, 2400, 1200],
      [2400, undefined, 1200]
    ])
    expect('end' in e.songs[2]).toBe(false)
  })

  it('fills each song from its row, a row with no artist with the mixer', () => {
    const s = pageEpisode(episode()).songs
    expect(s.map((x) => x.id)).toEqual([0, 1, 2].map((i) => songId('seventynine', i)))
    expect(s[1]).toMatchObject({ title: 'Two', artist: 'B' })
    expect(s[2]).toMatchObject({ title: 'Three', artist: 'Corticyte' })
  })

  it('makes one whole-file song for an episode with no tracklist or no length', () => {
    for (const ep of [episode({ tracks: [] }), episode({ duration: 0 })]) {
      const { songs } = pageEpisode(ep)
      expect(songs).toEqual([
        {
          id: songId('seventynine', 0),
          title: '79: Corticyte',
          artist: 'Corticyte',
          start: 0,
          length: ep.duration
        }
      ])
    }
  })

  it('gives year 0 for an episode with no date', () => {
    expect(pageEpisode(episode({ date: null })).year).toBe(0)
  })
})
