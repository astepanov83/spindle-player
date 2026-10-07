import { describe, expect, it } from 'vitest'
import { execFileSync } from 'child_process'
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { lengthMayBeGuessed, PacketSpan, probeLength, probeToTags, run, stream } from './probe'
import { normalizeTags } from './tags'

// ffprobe 7.0.2 on the user's "October Rust" image (APE 3.97, no tags).
const octoberRust = {
  streams: [
    {
      codec_name: 'ape',
      codec_long_name: "Monkey's Audio",
      codec_type: 'audio',
      sample_rate: '44100',
      channels: 2,
      bits_per_sample: 0,
      duration: '4378.333333',
      bits_per_raw_sample: '16'
    }
  ],
  format: { format_long_name: "Monkey's Audio", duration: '4378.333333' }
}

describe('probeToTags', () => {
  it('reads ReplayGain tags from the format or the stream', () => {
    const t = probeToTags({
      streams: [{ codec_type: 'audio', tags: { REPLAYGAIN_ALBUM_GAIN: '-6.00 dB' } }],
      format: { tags: { replaygain_track_gain: '-7.54 dB', REPLAYGAIN_TRACK_PEAK: '0.98' } }
    })!
    expect(normalizeTags(t).gain).toEqual({ track: -7.54, trackPeak: 0.98, album: -6 })
  })

  it('reads MusicBrainz ids under their ffprobe names', () => {
    const t = probeToTags({
      streams: [{ codec_type: 'audio' }],
      format: {
        tags: {
          MUSICBRAINZ_RELEASEGROUPID: 'f5093c06-23e3-404f-aeaa-40f72885ee3a',
          'MusicBrainz Album Id': '0f0a7b1c-5f3e-4f59-9e4e-1f7b0d3c2a11'
        }
      }
    })
    expect(t?.common.musicbrainz_releasegroupid).toBe('f5093c06-23e3-404f-aeaa-40f72885ee3a')
    expect(t?.common.musicbrainz_albumid).toBe('0f0a7b1c-5f3e-4f59-9e4e-1f7b0d3c2a11')
  })

  it('reads the format of a file with no tags', () => {
    const t = probeToTags(octoberRust)!
    expect(t.format).toEqual({
      duration: 4378.333333,
      codec: "Monkey's Audio",
      container: "Monkey's Audio",
      sampleRate: 44100,
      numberOfChannels: 2,
      bitsPerSample: 16
    })
    expect(normalizeTags(t, 'ape')).toEqual({
      duration: 4378.33,
      codec: "Monkey's Audio",
      container: "Monkey's Audio",
      sampleRate: 44100,
      channels: 2,
      bits: 16
    })
  })

  it('reads tags whatever their case and spelling', () => {
    const t = probeToTags({
      ...octoberRust,
      format: {
        ...octoberRust.format,
        tags: {
          Title: 'Bad Ground',
          ARTIST: 'Type O Negative',
          'Album Artist': 'Type O Negative',
          album: 'October Rust',
          Track: '1/15',
          disc: '2',
          Year: '1996',
          Genre: 'Gothic Metal'
        }
      }
    })!
    expect(normalizeTags(t)).toMatchObject({
      title: 'Bad Ground',
      artist: 'Type O Negative',
      albumArtist: 'Type O Negative',
      album: 'October Rust',
      track: 1,
      disc: 2,
      year: 1996,
      genre: 'Gothic Metal'
    })
  })

  it('takes stream tags (Ogg keeps them there) after the format ones', () => {
    const t = probeToTags({
      format: { tags: { title: 'From format' } },
      streams: [
        { codec_type: 'video', tags: { title: 'Cover' } },
        { codec_type: 'audio', tags: { TITLE: 'From stream', ARTIST: 'A' } }
      ]
    })!
    expect(t.common.title).toBe('From format')
    expect(t.common.artist).toBe('A')
  })

  it('calls ALAC "ALAC", as music-metadata does', () => {
    const t = probeToTags({
      streams: [{ codec_type: 'audio', codec_name: 'alac', codec_long_name: 'ALAC (Apple...)' }],
      format: {}
    })!
    expect(t.format.codec).toBe('ALAC')
  })

  it('gives nothing without an audio stream', () => {
    expect(probeToTags({ streams: [{ codec_type: 'video' }], format: {} })).toBeUndefined()
    expect(probeToTags('nope')).toBeUndefined()
  })
})

describe('run', () => {
  const node = process.execPath

  it('gives the output of a program run with an argument list', async () => {
    expect(await run(node, ['-e', 'process.stdout.write(process.argv[1])', 'a b; c'])).toBe(
      'a b; c'
    )
  })

  it('fails with the error text when the program fails', async () => {
    await expect(run(node, ['-e', 'console.error("bad file"); process.exit(3)'])).rejects.toThrow(
      /\(3\): bad file/
    )
  })

  it('kills a program that takes too long', async () => {
    await expect(run(node, ['-e', 'setTimeout(() => {}, 10000)'], 200)).rejects.toThrow(/SIGKILL/)
  })

  it('kills a program that says too much', async () => {
    await expect(
      run(
        node,
        ['-e', 'process.stdout.write("x".repeat(100000)); setTimeout(() => {}, 10000)'],
        5000,
        1000
      )
    ).rejects.toThrow(/more than 1000 bytes/)
  })

  it('fails when the program is not there', async () => {
    await expect(run('/nonexistent/ffprobe', [])).rejects.toThrow(/ENOENT/)
  })
})

// ffprobe's packet lines, pushed in pieces of `size` characters.
function spanOf(csv: string, size = csv.length || 1): number | undefined {
  const span = new PacketSpan()
  for (let i = 0; i < csv.length; i += size) span.push(csv.slice(i, i + size))
  return span.length()
}

describe('stream past its cap', () => {
  it('fails even when the program ends well before the kill lands', async () => {
    await expect(
      run(process.execPath, ['-e', 'process.stdout.write("x".repeat(100000))'], 5000, 1000)
    ).rejects.toThrow(/more than 1000 bytes/)
  })
})

describe('PacketSpan', () => {
  it('runs from the first packet to the end of the last', () => {
    expect(spanOf('0.000000,0.026122\n0.026122,0.026122\n120.006531,0.026122\n')).toBeCloseTo(
      120.032653,
      6
    )
    expect(spanOf('1.5,0.5\n3.0,0.5\n')).toBe(2)
  })

  it('skips lines with no time and gives nothing for no packets', () => {
    expect(spanOf('N/A,0.1\n2,1\n\n')).toBe(1)
    expect(spanOf('')).toBeUndefined()
  })

  it('gives the same length whatever the pieces are cut at', () => {
    const csv = '0.5,0.25\n1.0,0.25\n7.75,0.25'
    for (const size of [1, 2, 3, 7, 100]) expect(spanOf(csv, size)).toBe(7.5)
  })

  it('drops a line too long to be a packet, even when it comes in pieces', () => {
    const junk = '9'.repeat(5000)
    expect(spanOf(`1,1\n${junk}\n3,1\n`, 64)).toBe(3)
    expect(spanOf(`1,1\n3,1\n${junk}`, 64)).toBe(3)
  })
})

describe('stream', () => {
  const node = process.execPath

  it('hands on the output as it comes, with characters split between pieces kept whole', async () => {
    const pieces: string[] = []
    // "é" is two bytes; the first write ends between them
    const script =
      'process.stdout.write(Buffer.from([0x61, 0xc3]));' +
      'setTimeout(() => process.stdout.write(Buffer.from([0xa9, 0x62])), 50)'
    await stream(node, ['-e', script], (t) => pieces.push(t))
    expect(pieces.join('')).toBe('aéb')
    expect(pieces.length).toBeGreaterThan(1)
  })

  it('kills a program that says too much', async () => {
    await expect(
      stream(
        node,
        ['-e', 'process.stdout.write("x".repeat(100000)); setTimeout(() => {}, 10000)'],
        () => {},
        5000,
        1000
      )
    ).rejects.toThrow(/more than 1000 bytes/)
  })
})

// The bundled ffprobe on a real mp3 with no Xing header, when it is there.
const bin = (name: string): string => join(__dirname, '../../../../resources/ffmpeg', name)
describe.skipIf(!existsSync(bin('ffmpeg')) || !existsSync(bin('ffprobe')))('probeLength', () => {
  it('counts the packets of an mp3 with no length header', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'spindle-probe-'))
    try {
      const mp3 = join(dir, 'a.mp3')
      execFileSync(bin('ffmpeg'), [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=3',
        '-write_xing',
        '0',
        mp3
      ])
      // 3 s of sound, plus the encoder's padding in the last frame
      const length = await probeLength(bin('ffprobe'), mp3)
      expect(length).toBeGreaterThanOrEqual(3)
      expect(length).toBeLessThan(3.05)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('lengthMayBeGuessed', () => {
  it('is true for MPEG audio and raw ADTS AAC only', () => {
    expect(lengthMayBeGuessed('MP2/3 (MPEG audio layer 2/3)')).toBe(true)
    expect(lengthMayBeGuessed('raw ADTS AAC (Advanced Audio Coding)')).toBe(true)
    expect(lengthMayBeGuessed('WAV / WAVE (Waveform Audio)')).toBe(false)
    expect(lengthMayBeGuessed(undefined)).toBe(false)
  })
})
