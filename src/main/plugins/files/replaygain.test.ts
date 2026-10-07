import { describe, expect, it } from 'vitest'
import {
  cueGainLine,
  cueTrackGain,
  gainName,
  gainTagsOf,
  parseGainDb,
  parsePeak,
  parseReplayGain,
  replayGainOf
} from './replaygain'

describe('gainTagsOf', () => {
  it('finds the tags under each format’s name', () => {
    expect(gainName('TXXX:REPLAYGAIN_TRACK_GAIN')).toBe('replaygaintrackgain')
    expect(gainName('----:com.apple.iTunes:replaygain_album_peak')).toBe('replaygainalbumpeak')
    expect(gainName('R128_TRACK_GAIN')).toBe('r128trackgain')
  })

  it('keeps the first of each, as written, and only strings', () => {
    expect(
      gainTagsOf([
        ['TITLE', 'x'],
        ['REPLAYGAIN_TRACK_GAIN', '-3 dB'],
        ['TXXX:replaygain_track_gain', '-9 dB'],
        ['REPLAYGAIN_TRACK_PEAK', 0.5]
      ])
    ).toEqual({ replaygaintrackgain: '-3 dB' })
    expect(gainTagsOf([['TITLE', 'x']])).toBeUndefined()
  })
})

describe('parsing values', () => {
  it('reads gains with or without dB, a plus or a comma', () => {
    expect(parseGainDb('-7.54 dB')).toBe(-7.54)
    expect(parseGainDb('+3.2 dB')).toBe(3.2)
    expect(parseGainDb('-7.54')).toBe(-7.54)
    expect(parseGainDb('-6,5 dB')).toBe(-6.5)
    expect(parseGainDb('-1.234567 dB')).toBe(-1.23)
  })

  it('refuses gains that are not gains', () => {
    for (const s of ['', 'dB', 'loud', '-500 dB', 'NaN']) expect(parseGainDb(s)).toBeUndefined()
  })

  it('reads peaks, and takes 0 for no peak', () => {
    expect(parsePeak('0.988831')).toBe(0.988831)
    expect(parsePeak('1.2')).toBe(1.2)
    for (const s of ['0', '', '-1', 'x', '1000']) expect(parsePeak(s)).toBeUndefined()
  })
})

describe('replayGainOf', () => {
  it('takes all four', () => {
    expect(
      replayGainOf({
        replaygaintrackgain: '-7.54 dB',
        replaygaintrackpeak: '0.98',
        replaygainalbumgain: '-6.1 dB',
        replaygainalbumpeak: '1'
      })
    ).toEqual({ track: -7.54, trackPeak: 0.98, album: -6.1, albumPeak: 1 })
  })

  it('turns Opus R128 gains into ReplayGain’s level, 5 dB up', () => {
    // -2560 / 256 = -10 dB toward -23 LUFS, so -5 dB toward ReplayGain's
    expect(replayGainOf({ r128trackgain: '-2560', r128albumgain: '512' })).toEqual({
      track: -5,
      album: 7
    })
    expect(replayGainOf({ r128trackgain: '-2560', replaygaintrackgain: '-3 dB' })).toEqual({
      track: -3
    })
  })

  it('leaves out what is broken, and gives nothing when nothing is left', () => {
    expect(replayGainOf({ replaygaintrackgain: 'x', replaygaintrackpeak: '0.5' })).toEqual({
      trackPeak: 0.5
    })
    expect(replayGainOf({ replaygaintrackgain: 'x' })).toBeUndefined()
    expect(replayGainOf(undefined)).toBeUndefined()
  })
})

describe('cueGainLine', () => {
  it('takes album lines before the tracks and track lines under one', () => {
    expect(cueGainLine('REPLAYGAIN_ALBUM_GAIN', '-7.20 dB', false)).toEqual({
      field: 'album',
      value: -7.2
    })
    expect(cueGainLine('replaygain_track_peak', '0.9', true)).toEqual({
      field: 'trackPeak',
      value: 0.9
    })
    expect(cueGainLine('REPLAYGAIN_TRACK_GAIN', '-1 dB', false)).toBeUndefined()
    expect(cueGainLine('REPLAYGAIN_ALBUM_GAIN', '-1 dB', true)).toBeUndefined()
    expect(cueGainLine('DATE', '1991', false)).toBeUndefined()
    expect(cueGainLine('REPLAYGAIN_ALBUM_GAIN', 'loud', false)).toBeUndefined()
  })
})

describe('parseReplayGain', () => {
  it('keeps good fields and drops bad ones', () => {
    expect(parseReplayGain({ track: -3, trackPeak: 0.5, album: 'x', albumPeak: -1 })).toEqual({
      track: -3,
      trackPeak: 0.5
    })
    expect(parseReplayGain({ track: 999 })).toBeUndefined()
    expect(parseReplayGain([1])).toBeUndefined()
    expect(parseReplayGain(null)).toBeUndefined()
  })
})

describe('cueTrackGain', () => {
  const image = { track: -8, trackPeak: 0.9 }

  it('a track of a disc image: the image’s gain is the album’s', () => {
    expect(cueTrackGain(undefined, undefined, image, false)).toEqual({
      album: -8,
      albumPeak: 0.9
    })
  })

  it('the sheet’s lines win over the image', () => {
    expect(
      cueTrackGain({ album: -6 }, { track: -4, trackPeak: 0.7 }, { ...image, album: -9 }, false)
    ).toEqual({ track: -4, trackPeak: 0.7, album: -6, albumPeak: 0.9 })
  })

  it('a track that is a whole file keeps its file’s gains', () => {
    expect(cueTrackGain(undefined, undefined, { ...image, album: -6 }, true)).toEqual({
      track: -8,
      trackPeak: 0.9,
      album: -6
    })
  })

  it('nothing when no one has gains', () => {
    expect(cueTrackGain(undefined, undefined, undefined, false)).toBeUndefined()
  })
})
