import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { flacWith } from './fixtures/flac'
import { ReadLimitError } from './read-tags'
import {
  imageSize,
  maxTags,
  maxValue,
  nativeTags,
  plainError,
  probeToInfo,
  readSongInfo,
  songInfoIo,
  valueText,
  withBitrate,
  type SongInfoIo
} from './song-info'

let dir: string
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'spindle-info-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

// A PNG's first 24 bytes: the signature and IHDR with its width and height.
function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(24)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13], 0)
  b.set([0x49, 0x48, 0x44, 0x52], 12)
  const v = new DataView(b.buffer)
  v.setUint32(16, width)
  v.setUint32(20, height)
  return b
}

// A JPEG with an APP0 block before the frame that holds the size.
function jpeg(width: number, height: number): Uint8Array {
  const b = new Uint8Array(2 + 18 + 19)
  b.set([0xff, 0xd8, 0xff, 0xe0, 0, 16], 0)
  b.set([0xff, 0xc0, 0, 17, 8], 20)
  const v = new DataView(b.buffer)
  v.setUint16(25, height)
  v.setUint16(27, width)
  return b
}

// A Vorbis comment picture (METADATA_BLOCK_PICTURE), as base64.
function vorbisPicture(type: number, mime: string, data: Uint8Array): string {
  const enc = new TextEncoder()
  const m = enc.encode(mime)
  const b = new Uint8Array(32 + m.length + data.length)
  const v = new DataView(b.buffer)
  let at = 0
  v.setUint32(at, type)
  v.setUint32((at += 4), m.length)
  b.set(m, (at += 4))
  at += m.length
  // no description, then width, height, depth, colors (0: read from the picture)
  v.setUint32(at, 0)
  at += 4 + 16
  v.setUint32(at, data.length)
  b.set(data, at + 4)
  return Buffer.from(b).toString('base64')
}

describe('readSongInfo', () => {
  it('reads the format, every tag, the pictures and the gain of a file', async () => {
    const path = join(dir, 'song.flac')
    const cover = png(600, 500)
    await writeFile(
      path,
      flacWith([
        'TITLE=Night Bus',
        'ARTIST=Marina Vale',
        'REPLAYGAIN_TRACK_GAIN=-7.5 dB',
        'REPLAYGAIN_TRACK_PEAK=0.98',
        `METADATA_BLOCK_PICTURE=${vorbisPicture(3, 'image/png', cover)}`
      ])
    )
    const info = await readSongInfo(
      { path, added: 5, year: 2003, genre: ['Jazz'], gain: { track: 1 } },
      songInfoIo(undefined)
    )
    expect(info).toMatchObject({ path, added: 5, year: 2003, genre: ['Jazz'] })
    expect(info.size).toBeGreaterThan(0)
    expect(info.format).toMatchObject({
      container: 'FLAC',
      codec: 'FLAC',
      lossless: true,
      sampleRate: 44100,
      bits: 16,
      channels: 2,
      duration: 10
    })
    expect(info.format?.bitrate).toBeGreaterThan(0)
    expect(info.tags).toContainEqual({ type: 'vorbis', id: 'TITLE', value: 'Night Bus' })
    expect(info.tags).toContainEqual({ type: 'vorbis', id: 'ARTIST', value: 'Marina Vale' })
    const pic = info.tags?.find((t) => t.picture)
    expect(pic?.picture).toEqual({
      kind: 'Cover (front)',
      format: 'image/png',
      bytes: cover.length,
      width: 600,
      height: 500
    })
    expect(pic?.value).toBe('')
    // the file's own gain over what the index kept
    expect(info.gain).toEqual({ track: -7.5, trackPeak: 0.98 })
    expect(info.error).toBeUndefined()
  })

  it('a file deleted after the scan: what the index knows, and why', async () => {
    const info = await readSongInfo(
      { path: join(dir, 'gone.mp3'), added: 7, gain: { album: -3 } },
      songInfoIo(undefined)
    )
    expect(info).toEqual({
      path: join(dir, 'gone.mp3'),
      added: 7,
      gain: { album: -3 },
      gone: true,
      error: 'The file is not there any more. It was moved or deleted after the last scan.'
    })
  })

  it("a CUE track: its sheet and place, and the sheet's gain, not the image's", async () => {
    const path = join(dir, 'disc.flac')
    await writeFile(path, flacWith(['REPLAYGAIN_TRACK_GAIN=-9 dB']))
    const sheet = join(dir, 'disc.cue')
    await writeFile(sheet, 'FILE "disc.flac" WAVE')
    const cue = { sheet, start: 5, end: 9.5 }
    const info = await readSongInfo({ path, cue, gain: { track: -2 } }, songInfoIo(undefined))
    expect(info.cue).toEqual(cue)
    expect(info.gain).toEqual({ track: -2 })
    await rm(sheet)
    const later = await readSongInfo({ path, cue }, songInfoIo(undefined))
    expect(later.cue).toEqual({ ...cue, sheetGone: true })
    expect(later.gain).toBeUndefined()
  })

  const io = (o: Partial<SongInfoIo>): SongInfoIo => ({
    stat: async () => ({ size: 1000, mtimeMs: 1.4 }),
    readTags: async () => {
      throw new Error('Guessed MIME-type not supported: audio/x-ape')
    },
    ...o
  })

  it("asks ffprobe what music-metadata can't read", async () => {
    const info = await readSongInfo(
      { path: '/m/a.ape' },
      io({
        probe: async () => ({
          format: { codec: "Monkey's Audio", duration: 8 },
          tags: [
            { type: 'ffprobe', id: 'Title', value: 'A' },
            { type: 'ffprobe', id: 'REPLAYGAIN_ALBUM_GAIN', value: '-4.00 dB' }
          ]
        })
      })
    )
    expect(info).toMatchObject({
      probed: true,
      size: 1000,
      modified: 1,
      format: { codec: "Monkey's Audio", bitrate: 1000, bitrateFrom: 'size' },
      gain: { album: -4 }
    })
    expect(info.tags).toHaveLength(2)
    expect(info.error).toBeUndefined()
  })

  it("says why when neither can read it, keeping the index's gain", async () => {
    const info = await readSongInfo(
      { path: '/m/a.ape', gain: { track: -1 } },
      io({ probe: async () => Promise.reject(new Error('no')) })
    )
    expect(info.error).toBe(
      'The file could not be read: Guessed MIME-type not supported: audio/x-ape'
    )
    expect(info.gain).toEqual({ track: -1 })
    expect(info.tags).toBeUndefined()
  })

  it('lists ffprobe tags for an old APE that music-metadata reads only the header of', async () => {
    const info = await readSongInfo(
      { path: '/m/old.ape' },
      io({
        readTags: async () => ({
          common: {},
          format: { container: "Monkey's Audio", duration: 10, sampleRate: 44100 }
        }),
        probe: async () => ({ format: {}, tags: [{ type: 'ffprobe', id: 'Artist', value: 'B' }] })
      })
    )
    expect(info.probed).toBe(true)
    expect(info.tags).toEqual([{ type: 'ffprobe', id: 'Artist', value: 'B' }])
    expect(info.format).toMatchObject({ sampleRate: 44100, bitrate: 800, bitrateFrom: 'size' })
  })
})

describe('nativeTags', () => {
  it('lists every tag in order, by kind of tag', () => {
    const tags = nativeTags({
      'ID3v2.3': [
        { id: 'TIT2', value: 'Song' },
        { id: 'TRCK', value: '3/12' },
        { id: 'COMM', value: { language: 'eng', descriptor: '', text: 'Nice' } },
        { id: 'TXXX:MOOD', value: 'calm' },
        { id: 'APIC', value: { format: 'image/jpeg', type: 'Cover (back)', data: jpeg(300, 200) } }
      ],
      ID3v1: [{ id: 'year', value: 2003 }]
    })
    expect(tags).toEqual([
      { type: 'ID3v2.3', id: 'TIT2', value: 'Song' },
      { type: 'ID3v2.3', id: 'TRCK', value: '3/12' },
      { type: 'ID3v2.3', id: 'COMM', value: 'Nice' },
      { type: 'ID3v2.3', id: 'TXXX:MOOD', value: 'calm' },
      {
        type: 'ID3v2.3',
        id: 'APIC',
        value: '',
        picture: {
          kind: 'Cover (back)',
          format: 'image/jpeg',
          bytes: jpeg(1, 1).length,
          width: 300,
          height: 200
        }
      },
      { type: 'ID3v1', id: 'year', value: '2003' }
    ])
  })

  it('cuts a long value and says so', () => {
    const [t] = nativeTags({ vorbis: [{ id: 'LYRICS', value: 'x'.repeat(maxValue + 5) }] })
    expect(t.value).toHaveLength(maxValue)
    expect(t.cut).toBe(true)
  })

  it('an MP4 picture with a short format', () => {
    const [t] = nativeTags({
      iTunes: [{ id: 'covr', value: { format: 'JPEG', data: jpeg(10, 20) } }]
    })
    expect(t.picture).toMatchObject({ format: 'image/jpeg', width: 10, height: 20 })
  })
})

describe('valueText', () => {
  it('turns each kind of value into text', () => {
    expect(valueText('a')).toBe('a')
    expect(valueText(3)).toBe('3')
    expect(valueText(true)).toBe('true')
    expect(valueText(['a', 2])).toBe('a, 2')
    expect(valueText(new Uint8Array(1234))).toBe('1,234 bytes of data')
    expect(valueText({ descriptor: 'iTunNORM', text: ' 0000' })).toBe('iTunNORM:  0000')
    expect(valueText({ syncText: [{ text: 'one' }, { text: 'two' }] })).toBe('one\ntwo')
    expect(valueText({ no: 3, of: 12 })).toBe('{"no":3,"of":12}')
    expect(valueText({ blob: new Uint8Array(2) })).toBe('{"blob":"2 bytes of data"}')
    expect(valueText(null)).toBe('')
  })
})

describe('imageSize', () => {
  it('reads PNG, JPEG, GIF and WebP', () => {
    expect(imageSize(png(1200, 1000))).toEqual({ width: 1200, height: 1000 })
    expect(imageSize(jpeg(640, 480))).toEqual({ width: 640, height: 480 })
    const gif = new Uint8Array(10)
    gif.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 32, 1, 16, 0])
    expect(imageSize(gif)).toEqual({ width: 288, height: 16 })
    const webp = new Uint8Array(30)
    webp.set(
      [...'RIFF'].map((c) => c.charCodeAt(0)),
      0
    )
    webp.set(
      [...'WEBPVP8X'].map((c) => c.charCodeAt(0)),
      8
    )
    webp.set([99, 0, 0, 49, 0, 0], 24)
    expect(imageSize(webp)).toEqual({ width: 100, height: 50 })
  })

  it('gives nothing for what it does not know', () => {
    expect(imageSize(new Uint8Array([1, 2, 3]))).toEqual({})
    expect(imageSize(new Uint8Array([0xff, 0xd8, 0x12]))).toEqual({})
  })
})

describe('withBitrate', () => {
  it("keeps the header's", () => {
    expect(withBitrate({ bitrate: 320000, duration: 10 }, 1, 0)).toEqual({
      bitrate: 320000,
      duration: 10,
      bitrateFrom: 'header'
    })
  })

  it('works it out from the size and the length, pictures left out', () => {
    // 1.2 MB of sound over 30 s is 320 kbps
    expect(withBitrate({ duration: 30 }, 1_200_000 + 50_000, 50_000)).toEqual({
      duration: 30,
      bitrate: 320000,
      bitrateFrom: 'size'
    })
  })

  it('leaves it out with no length', () => {
    expect(withBitrate({}, 1000, 0)).toEqual({})
  })
})

describe('plainError', () => {
  const coded = (code: string): Error => Object.assign(new Error('x'), { code })

  it('says in words why a file could not be read', () => {
    expect(plainError(coded('ENOENT'))).toMatch(/not there any more/)
    expect(plainError(coded('EACCES'))).toBe('Spindle is not allowed to read this file.')
    expect(plainError(coded('EIO'))).toMatch(/disk gave an error/)
    expect(plainError(new ReadLimitError(4096))).toMatch(/without reading too much/)
    const unknown = Object.assign(new Error('?'), { name: 'CouldNotDetermineFileTypeError' })
    expect(plainError(unknown)).toBe('The file is not in an audio format Spindle can read.')
    expect(plainError(new Error('Bad frame'))).toBe('The file could not be read: Bad frame')
  })
})

describe('probeToInfo', () => {
  it("takes the audio stream's format and the container's and stream's tags", () => {
    const info = probeToInfo({
      format: {
        format_long_name: "Monkey's Audio",
        duration: '200.5',
        bit_rate: '900000',
        tags: { Title: 'A', Artist: 'B' }
      },
      streams: [
        {
          codec_type: 'audio',
          codec_name: 'ape',
          codec_long_name: "Monkey's Audio",
          profile: 'unknown',
          sample_rate: '44100',
          channels: 2,
          bits_per_raw_sample: '16',
          tags: { encoder: 'x' }
        }
      ]
    })
    expect(info).toEqual({
      format: {
        container: "Monkey's Audio",
        codec: "Monkey's Audio",
        sampleRate: 44100,
        bits: 16,
        channels: 2,
        bitrate: 900000,
        duration: 200.5
      },
      tags: [
        { type: 'ffprobe', id: 'Title', value: 'A' },
        { type: 'ffprobe', id: 'Artist', value: 'B' },
        { type: 'ffprobe', id: 'encoder', value: 'x' }
      ]
    })
  })

  it('needs an audio stream', () => {
    expect(probeToInfo({ streams: [{ codec_type: 'video' }] })).toBeUndefined()
    expect(probeToInfo('x')).toBeUndefined()
  })
})

it('counts the tags past the most it lists', async () => {
  const many = Array.from({ length: maxTags + 3 }, (_, i) => ({ id: `T${i}`, value: 'v' }))
  const info = await readSongInfo(
    { path: '/m/a.flac' },
    {
      stat: async () => ({ size: 10, mtimeMs: 0 }),
      readTags: async () => ({ common: {}, format: {}, native: { vorbis: many } })
    }
  )
  expect(info.tags).toHaveLength(maxTags)
  expect(info.moreTags).toBe(3)
})
