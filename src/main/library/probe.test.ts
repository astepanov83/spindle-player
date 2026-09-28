import { describe, expect, it } from 'vitest'
import { probeToTags, run } from './probe'
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
    ).rejects.toThrow(/SIGKILL/)
  })

  it('fails when the program is not there', async () => {
    await expect(run('/nonexistent/ffprobe', [])).rejects.toThrow(/ENOENT/)
  })
})
