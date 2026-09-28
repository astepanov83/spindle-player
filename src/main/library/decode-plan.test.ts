import { describe, expect, it } from 'vitest'
import { DecodePlans, type Prober } from './decode-plan'
import type { RawTags } from './tags'
import type { MediaInfo } from './types'

function prober(format: RawTags['format'], length?: number): Prober & { asked: string[] } {
  const asked: string[] = []
  return {
    asked,
    tags: async (p) => {
      asked.push(`tags ${p}`)
      return { common: {}, format }
    },
    length: async (p) => {
      asked.push(`length ${p}`)
      return length
    }
  }
}

const ape: MediaInfo = {
  path: '/m/a.ape',
  duration: 100,
  sampleRate: 44100,
  channels: 2,
  bits: 16
}

describe('DecodePlans', () => {
  it('takes the format and length from the index when it has them', async () => {
    const p = prober({})
    const plan = await new DecodePlans().get(ape, '1:10', false, p)
    expect(plan).toEqual({ format: { sampleRate: 44100, channels: 2, bits: 16 }, duration: 100 })
    expect(p.asked).toEqual([])
  })

  it('asks ffprobe once per version of the file', async () => {
    const plans = new DecodePlans()
    const p = prober({ duration: 50, sampleRate: 48000, numberOfChannels: 2, bitsPerSample: 24 })
    const wma: MediaInfo = { path: '/m/a.wma', duration: 50 }
    const a = await plans.get(wma, '1:10', false, p)
    expect(a).toEqual({ format: { sampleRate: 48000, channels: 2, bits: 24 }, duration: 50 })
    await plans.get(wma, '1:10', false, p)
    expect(p.asked).toEqual(['tags /m/a.wma'])
    // the file changed (mtime or size): asked again
    await plans.get(wma, '2:12', false, p)
    expect(p.asked).toEqual(['tags /m/a.wma', 'tags /m/a.wma'])
  })

  it('asks ffprobe for a file the page asked to decode, even with an index format', async () => {
    const p = prober({ duration: 99, sampleRate: 44100, numberOfChannels: 1 })
    const plan = await new DecodePlans().get(ape, '1:10', true, p)
    expect(plan?.duration).toBe(99)
    expect(plan?.format.channels).toBe(1)
  })

  it('counts the real length of an mp3 whose length is a guess from the bitrate', async () => {
    const p = prober(
      {
        duration: 172.6,
        container: 'MP2/3 (MPEG audio layer 2/3)',
        sampleRate: 44100,
        numberOfChannels: 2
      },
      120.03
    )
    const mp3: MediaInfo = { path: '/m/vbr.mp3', duration: 172.6 }
    expect((await new DecodePlans().get(mp3, '1:10', true, p))?.duration).toBe(120.03)
    expect(p.asked).toEqual(['tags /m/vbr.mp3', 'length /m/vbr.mp3'])
  })

  it('gives nothing without ffprobe, or without a format', async () => {
    const wma: MediaInfo = { path: '/m/a.wma', duration: 50 }
    expect(await new DecodePlans().get(wma, '1', false, undefined)).toBeUndefined()
    expect(await new DecodePlans().get(wma, '1', false, prober({ duration: 5 }))).toBeUndefined()
  })
})
