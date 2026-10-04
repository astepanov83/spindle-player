import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { oggDuration, oldApeHeader, readBudget, readTags, ReadLimitError } from './read-tags'

const hex = (s: string): Uint8Array => Uint8Array.from(Buffer.from(s.replace(/\s/g, ''), 'hex'))

// The first 32 bytes of two of the user's APE files.
const oldApe = hex('4d414320 820f b80b 1600 0200 44ac0000 2c000000 00000000 0f020000 c8210100')
const newApe = hex('4d414320 960f0000 34000000 18000000 dc250000 2c000000 2479581c 00000000')

// A FLAC with only its STREAMINFO block: 44.1 kHz, 2 channels, 16 bits, 10 s.
function flac(): Uint8Array {
  const b = new Uint8Array(4 + 4 + 34)
  b.set([0x66, 0x4c, 0x61, 0x43], 0)
  b.set([0x80, 0, 0, 34], 4)
  const v = new DataView(b.buffer)
  v.setUint16(8, 4096)
  v.setUint16(10, 4096)
  const packed = (44100n << 44n) | (1n << 41n) | (15n << 36n) | 441000n
  v.setBigUint64(18, packed)
  return b
}

// An APE with the new header whose sizes point nowhere near the tag, so
// music-metadata reads the rest of the file looking for it.
function badApe(size: number): Uint8Array {
  const b = new Uint8Array(size)
  b.set([0x4d, 0x41, 0x43, 0x20], 0)
  const v = new DataView(b.buffer)
  v.setUint32(4, 3990, true)
  v.setUint32(8, 52, true)
  v.setUint32(12, 24, true)
  v.setUint32(52 + 20, 44100, true)
  return b
}

function oggPage(granule: bigint): Uint8Array {
  const p = new Uint8Array(27)
  p.set([0x4f, 0x67, 0x67, 0x53, 0, 4], 0)
  new DataView(p.buffer).setBigInt64(6, granule, true)
  return p
}

let dir: string
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'spindle-tags-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('oldApeHeader', () => {
  it('reads the length from a header before 3.98', () => {
    const h = oldApeHeader(oldApe)!
    // 527 frames of 294912 blocks, the last one 74184, at 44.1 kHz
    expect(h.duration).toBeCloseTo((526 * 294912 + 74184) / 44100, 3)
    expect(h.container).toBe("Monkey's Audio")
    expect([h.sampleRate, h.numberOfChannels, h.bitsPerSample]).toEqual([44100, 2, 16])
  })

  it('leaves the new header and other files to music-metadata', () => {
    expect(oldApeHeader(newApe)).toBeUndefined()
    expect(oldApeHeader(flac().subarray(0, 32))).toBeUndefined()
    expect(oldApeHeader(oldApe.subarray(0, 10))).toBeUndefined()
  })
})

describe('oggDuration', () => {
  it('takes the granule position of the last page', () => {
    const tail = new Uint8Array(200)
    tail.set(oggPage(44100n * 5n), 10)
    tail.set(oggPage(44100n * 7n), 100)
    expect(oggDuration(tail, 44100)).toBe(7)
  })

  it('skips a last page with no position and gives up without a page', () => {
    const tail = new Uint8Array(200)
    tail.set(oggPage(48000n * 3n), 10)
    tail.set(oggPage(-1n), 100)
    expect(oggDuration(tail, 48000)).toBe(3)
    expect(oggDuration(new Uint8Array(100), 48000)).toBeUndefined()
    expect(oggDuration(tail, undefined)).toBeUndefined()
  })
})

describe('readBudget', () => {
  const MB = 1024 * 1024
  it('lets small files be read whole, and big ones only in part', () => {
    expect(readBudget(4 * MB)).toEqual({ small: 2 * MB, single: 4 * MB, total: 32 * MB })
    expect(readBudget(40 * MB)).toEqual({ small: 10 * MB, single: 20 * MB, total: 32 * MB })
  })
})

// A FLAC whose PICTURE block holds `picture` bytes.
function flacWithPicture(picture: number): Uint8Array {
  const info = flac()
  info[4] = 0 // STREAMINFO is no longer the last block
  const mime = new TextEncoder().encode('image/jpeg')
  const body = new Uint8Array(4 + 4 + mime.length + 4 + 16 + 4 + picture)
  const v = new DataView(body.buffer)
  v.setUint32(0, 3) // front cover
  v.setUint32(4, mime.length)
  body.set(mime, 8)
  v.setUint32(8 + mime.length + 4 + 16, picture)
  const head = new Uint8Array([
    0x86,
    (body.length >> 16) & 255,
    (body.length >> 8) & 255,
    body.length & 255
  ])
  const out = new Uint8Array(info.length + 4 + body.length)
  out.set(info, 0)
  out.set(head, info.length)
  out.set(body, info.length + 4)
  return out
}

// An APE with the new header, `audio` bytes of frames, and an APEv2 tag at the end.
function apeWithEndTag(audio: number, title: string): Uint8Array {
  const value = new TextEncoder().encode(title)
  const key = new TextEncoder().encode('Title\0')
  const items = 8 + key.length + value.length
  const b = new Uint8Array(76 + audio + items + 32)
  const v = new DataView(b.buffer)
  b.set([0x4d, 0x41, 0x43, 0x20], 0)
  v.setUint32(4, 3990, true)
  v.setUint32(8, 52, true)
  v.setUint32(12, 24, true)
  v.setUint32(24, audio, true)
  // header: 1 frame of 44100 blocks at 44.1 kHz, so 1 s
  v.setUint16(52, 2000, true)
  v.setUint32(56, 73728 * 4, true)
  v.setUint32(60, 44100, true)
  v.setUint32(64, 1, true)
  v.setUint16(68, 16, true)
  v.setUint16(70, 2, true)
  v.setUint32(72, 44100, true)
  let at = 76 + audio
  v.setUint32(at, value.length, true)
  b.set(key, at + 8)
  b.set(value, at + 8 + key.length)
  at += items
  b.set(new TextEncoder().encode('APETAGEX'), at)
  v.setUint32(at + 8, 2000, true)
  v.setUint32(at + 12, items + 32, true)
  v.setUint32(at + 16, 1, true)
  return b
}

const MB = 1024 * 1024
const tiny = { small: 1024, single: 1024, total: 1024 }

describe('readTags', () => {
  it('reads a FLAC header', async () => {
    const path = join(dir, 'a.flac')
    await writeFile(path, flac())
    const m = await readTags(path)
    expect(m.format.container).toBe('FLAC')
    expect(m.format.duration).toBe(10)
  })

  it('reads a picture that is most of a small file', async () => {
    const path = join(dir, 'cover.flac')
    await writeFile(path, flacWithPicture(3 * MB))
    const m = await readTags(path)
    expect(m.common.picture?.[0].data.length).toBe(3 * MB)
  })

  it('reads an APEv2 tag at the end of a big file without reading the audio', async () => {
    const path = join(dir, 'tagged.ape')
    await writeFile(path, apeWithEndTag(40 * MB, 'End Tag'))
    const m = await readTags(path, { budget: { small: 64 * 1024, single: 64 * 1024, total: MB } })
    expect(m.common.title).toBe('End Tag')
    expect(m.format.duration).toBe(1)
  })

  it('gets the length of an old APE from its header alone', async () => {
    const path = join(dir, 'old.ape')
    const b = new Uint8Array(4 * MB)
    b.set(oldApe, 0)
    await writeFile(path, b)
    const m = await readTags(path, { budget: tiny })
    expect(m.format.duration).toBeGreaterThan(3500)
  })

  it('stops a broken APE before its read of the rest of the file', async () => {
    const path = join(dir, 'bad.ape')
    await writeFile(path, badApe(20 * MB))
    const e = await readTags(path).catch((e) => e)
    expect(e).toBeInstanceOf(ReadLimitError)
    expect(e.read).toBeLessThan(64 * 1024)
    // with room for the whole file, music-metadata reads all of it and then fails
    const all = { small: 40 * MB, single: 40 * MB, total: 40 * MB }
    await expect(readTags(path, { budget: all })).rejects.toThrow(/APEv2 Footer/)
  })

  it('stops an mp3 that is not one after a part of it that grows with the file', async () => {
    for (const [size, most] of [
      [4 * MB, 2 * MB],
      [16 * MB, 4 * MB]
    ]) {
      const path = join(dir, `zeros-${size}.mp3`)
      await writeFile(path, new Uint8Array(size))
      const e = await readTags(path).catch((e) => e)
      expect(e).toBeInstanceOf(ReadLimitError)
      expect(e.read).toBeLessThanOrEqual(most)
      expect(e.read).toBeGreaterThan(most / 2)
    }
  })

  describe('with ffprobe', () => {
    const probed = {
      common: { title: 'From ffprobe', album: 'Album' },
      format: { duration: 99, container: 'probed', sampleRate: 48000, numberOfChannels: 2 }
    }

    it('gets the tags of an old APE, and keeps the length from its header', async () => {
      const path = join(dir, 'old-probed.ape')
      const b = new Uint8Array(1024)
      b.set(oldApe, 0)
      await writeFile(path, b)
      const asked: string[] = []
      const m = await readTags(path, {
        probe: async (p) => {
          asked.push(p)
          return probed
        }
      })
      expect(asked).toEqual([path])
      expect(m.common.title).toBe('From ffprobe')
      expect(m.format.container).toBe("Monkey's Audio")
      expect(m.format.duration).toBeGreaterThan(3500)
      expect(m.format.sampleRate).toBe(44100)
    })

    it('still gives the length of an old APE when ffprobe fails', async () => {
      const path = join(dir, 'old-noprobe.ape')
      const b = new Uint8Array(1024)
      b.set(oldApe, 0)
      await writeFile(path, b)
      const m = await readTags(path, { probe: () => Promise.reject(new Error('no')) })
      expect(m.common).toEqual({})
      expect(m.format.duration).toBeGreaterThan(3500)
    })

    it('asks ffprobe about a file music-metadata cannot read', async () => {
      const path = join(dir, 'zeros-probed.mp3')
      await writeFile(path, new Uint8Array(4 * MB))
      const m = await readTags(path, { probe: async () => probed })
      expect(m.common.title).toBe('From ffprobe')
    })

    it('keeps music-metadata’s error when ffprobe fails too', async () => {
      const path = join(dir, 'zeros-both.mp3')
      await writeFile(path, new Uint8Array(4 * MB))
      const e = await readTags(path, { probe: () => Promise.reject(new Error('no')) }).catch(
        (e) => e
      )
      expect(e).toBeInstanceOf(ReadLimitError)
    })

    it('leaves a file music-metadata reads alone', async () => {
      const path = join(dir, 'b.flac')
      await writeFile(path, flac())
      let asked = false
      await readTags(path, {
        probe: async () => {
          asked = true
          return probed
        }
      })
      expect(asked).toBe(false)
    })
  })
})
