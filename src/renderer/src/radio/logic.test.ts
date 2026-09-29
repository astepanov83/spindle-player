import { describe, expect, it } from 'vitest'
import type { Station, Stream } from '../../../shared/stations'
import {
  cantPlayFormat,
  firstStream,
  nextStream,
  parseTitle,
  retryDelayMs,
  stepStation
} from './logic'

describe('parseTitle (from webmusicmo)', () => {
  it('splits "artist - song * dj OnAir * show *" into parts', () => {
    expect(
      parseTitle('M-16 (USA) - Shot Down * Blacky OnAir * 60er Bis 95er Beat, Rock * ')
    ).toEqual({
      raw: 'M-16 (USA) - Shot Down * Blacky OnAir * 60er Bis 95er Beat, Rock *',
      track: 'M-16 (USA) - Shot Down',
      artist: 'M-16 (USA)',
      song: 'Shot Down',
      dj: 'Blacky',
      show: '60er Bis 95er Beat, Rock'
    })
  })

  it('handles a plain "artist - song" title', () => {
    const t = parseTitle('Iron Maiden - The Trooper')
    expect([t.artist, t.song, t.dj, t.show]).toEqual(['Iron Maiden', 'The Trooper', '', ''])
  })

  it('keeps a title without a dash as the song', () => {
    const t = parseTitle('Station Jingle')
    expect([t.artist, t.song, t.track]).toEqual(['', 'Station Jingle', 'Station Jingle'])
  })

  it('decodes html entities and handles empty input', () => {
    expect(parseTitle('Foo &amp; Bar - Baz').artist).toBe('Foo & Bar')
    expect(parseTitle('').song).toBe('')
  })
})

const s = (url: string, bitrate?: number): Stream => (bitrate ? { url, bitrate } : { url })

describe('nextStream: nearest bitrate first', () => {
  const streams = [s('a', 64), s('b', 128), s('c', 320), s('d'), s('e', 192), s('f')]

  it('takes the nearest bitrate that has not failed; a tie goes to the lower', () => {
    expect(nextStream(streams, 1, new Set([1]))).toBe(0)
    expect(nextStream(streams, 1, new Set([1, 0]))).toBe(4)
    expect(nextStream(streams, 4, new Set([4, 1]))).toBe(0)
    expect(nextStream(streams, 2, new Set([2]))).toBe(4)
  })

  it('tries streams of unknown bitrate after the known ones, in list order', () => {
    expect(nextStream(streams, 1, new Set([0, 1, 2, 4]))).toBe(3)
    expect(nextStream(streams, 1, new Set([0, 1, 2, 3, 4]))).toBe(5)
  })

  it('from a stream of unknown bitrate, goes in list order', () => {
    expect(nextStream(streams, 3, new Set([3]))).toBe(0)
    expect(nextStream(streams, 5, new Set([5, 0]))).toBe(1)
  })

  it('gives -1 when all have failed', () => {
    expect(nextStream(streams, 0, new Set([0, 1, 2, 3, 4, 5]))).toBe(-1)
  })
})

describe('firstStream', () => {
  it('is the chosen one, else the first', () => {
    const st: Station = { id: 'x', name: 'X', tags: [], streams: [s('a'), s('b')] }
    expect(firstStream(st)).toBe(0)
    expect(firstStream({ ...st, chosen: 'b' })).toBe(1)
    expect(firstStream({ ...st, chosen: 'gone' })).toBe(0)
    expect(firstStream({ ...st, streams: [] })).toBe(-1)
  })
})

describe('retryDelayMs', () => {
  it('waits 1, 2, 4, 8, 16, then 30 s', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 9].map(retryDelayMs)).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000
    ])
  })
})

describe('stepStation', () => {
  const list = ['a', 'b', 'c'].map((id) => ({ id }))
  it('steps through the list and wraps around', () => {
    expect(stepStation(list, 'a', 1)).toBe('b')
    expect(stepStation(list, 'c', 1)).toBe('a')
    expect(stepStation(list, 'a', -1)).toBe('c')
  })
  it('from a station not in the list: the first, or the last going back', () => {
    expect(stepStation(list, 'zz', 1)).toBe('a')
    expect(stepStation(list, 'zz', -1)).toBe('c')
    expect(stepStation([], 'zz', 1)).toBeUndefined()
  })
})

describe('cantPlayFormat', () => {
  it('is audio passed by main with no sound from it', () => {
    expect(cantPlayFormat(false, { ok: true, bytes: 40000 })).toBe(true)
  })
  it('is not a server main could not reach, a stream that played, or one that sent little', () => {
    expect(cantPlayFormat(false, { ok: false, bytes: 0 })).toBe(false)
    expect(cantPlayFormat(false, undefined)).toBe(false)
    expect(cantPlayFormat(true, { ok: true, bytes: 900000 })).toBe(false)
    expect(cantPlayFormat(false, { ok: true, bytes: 1000 })).toBe(false)
  })
})
