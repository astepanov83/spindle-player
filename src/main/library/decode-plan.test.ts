import { describe, expect, it, vi } from 'vitest'
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

// A tags() that can be held open and then resolved or rejected by hand, so a
// test can check what a second get() sees while the first is still running.
function heldTagsProber(length?: number): Prober & {
  asked: string[]
  resolveTags: (t: RawTags) => void
  rejectTags: (e: Error) => void
} {
  const asked: string[] = []
  let resolveTags: (t: RawTags) => void = () => {}
  let rejectTags: (e: Error) => void = () => {}
  return {
    asked,
    resolveTags: (t) => resolveTags(t),
    rejectTags: (e) => rejectTags(e),
    tags: (p) => {
      asked.push(`tags ${p}`)
      return new Promise((res, rej) => {
        resolveTags = res
        rejectTags = rej
      })
    },
    length: async (p) => {
      asked.push(`length ${p}`)
      return length
    }
  }
}

// A length() that always rejects, e.g. an ffprobe timeout or output cap.
function failingLengthProber(
  format: RawTags['format'],
  error: Error
): Prober & { asked: string[] } {
  const asked: string[] = []
  return {
    asked,
    tags: async (p) => {
      asked.push(`tags ${p}`)
      return { common: {}, format }
    },
    length: async (p) => {
      asked.push(`length ${p}`)
      throw error
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

  it('shares one ffprobe run between two callers that arrive before it settles', async () => {
    const plans = new DecodePlans()
    const p = heldTagsProber()
    const mp3: MediaInfo = { path: '/m/vbr.mp3', duration: 172.6 }
    const a = plans.get(mp3, '1:10', true, p)
    const b = plans.get(mp3, '1:10', true, p)
    // only one tags() call, even though both get() calls are in flight
    expect(p.asked).toEqual(['tags /m/vbr.mp3'])
    p.resolveTags({ common: {}, format: { duration: 50, sampleRate: 44100, numberOfChannels: 2 } })
    const [planA, planB] = await Promise.all([a, b])
    expect(planA).toEqual(planB)
    expect(planA?.duration).toBe(50)
    expect(p.asked).toEqual(['tags /m/vbr.mp3'])
  })

  it('falls back to the guessed duration when the real length fails, and caches it', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const plans = new DecodePlans()
    const p = failingLengthProber(
      {
        duration: 172.6,
        container: 'MP2/3 (MPEG audio layer 2/3)',
        sampleRate: 44100,
        numberOfChannels: 2
      },
      new Error('ffprobe timed out')
    )
    const mp3: MediaInfo = { path: '/m/vbr.mp3', duration: 172.6 }
    const plan = await plans.get(mp3, '1:10', true, p)
    expect(plan?.duration).toBe(172.6)
    expect(spy).toHaveBeenCalledTimes(1)
    // cached: a second get() makes no new ffprobe calls
    await plans.get(mp3, '1:10', true, p)
    expect(p.asked).toEqual(['tags /m/vbr.mp3', 'length /m/vbr.mp3'])
    spy.mockRestore()
  })

  it('leaves nothing pending when tags() rejects, so a later get() tries again', async () => {
    const plans = new DecodePlans()
    const p = heldTagsProber()
    const mp3: MediaInfo = { path: '/m/vbr.mp3', duration: 172.6 }
    const first = plans.get(mp3, '1:10', true, p)
    p.rejectTags(new Error('ffprobe failed'))
    await expect(first).rejects.toThrow('ffprobe failed')
    const second = plans.get(mp3, '1:10', true, p)
    p.resolveTags({ common: {}, format: { duration: 50, sampleRate: 44100, numberOfChannels: 2 } })
    expect((await second)?.duration).toBe(50)
    expect(p.asked).toEqual(['tags /m/vbr.mp3', 'tags /m/vbr.mp3'])
  })
})
