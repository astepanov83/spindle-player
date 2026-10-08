import { describe, expect, it } from 'vitest'
import type { Album, LibraryData, Track } from '../../../shared/library'
import { decodeCurve } from '../../../shared/loudness-text'
import {
  addLoudness,
  curveOf,
  cutsKey,
  Energy,
  floorDb,
  isFresh,
  levelOf,
  loudCounts,
  loudPlan,
  parseLoudness,
  points,
  pruneLoudness,
  serializeLoudness,
  splitCurves,
  topDb,
  textOf,
  completes,
  windowsPerSecond,
  type LoudFile,
  type LoudStore,
  type Windows
} from './loudness'

const rate = 1000
const perWindow = rate / windowsPerSecond

// 16-bit little-endian PCM of a square wave at `amp` (share of full scale) for `seconds`
function pcm(parts: { amp: number; seconds: number }[]): Uint8Array {
  const n = parts.reduce((a, p) => a + Math.round(p.seconds * rate), 0)
  const out = new Uint8Array(n * 2)
  const view = new DataView(out.buffer)
  let i = 0
  for (const p of parts)
    for (let k = 0; k < Math.round(p.seconds * rate); k++, i++)
      view.setInt16(i * 2, Math.round((k % 2 ? 1 : -1) * p.amp * 0x7fff), true)
  return out
}

function windowsOf(b: Uint8Array, pieces = 1): Windows {
  const e = new Energy(rate)
  const size = Math.ceil(b.length / pieces)
  for (let i = 0; i < b.length; i += size) e.add(b.subarray(i, i + size))
  return e.finish()
}

// the byte a steady level in dB gives
const byteAt = (db: number): number =>
  Math.round(Math.min(1, Math.max(0, (db - floorDb) / (topDb - floorDb))) * 255)
const db = (amp: number): number => 20 * Math.log10(amp)

describe('Energy', () => {
  it('sums squared samples per window', () => {
    const w = windowsOf(pcm([{ amp: 0.5, seconds: 1 }]))
    expect(w.sums).toHaveLength(windowsPerSecond)
    expect(w.perWindow).toBe(perWindow)
    expect(w.sums[0]).toBeCloseTo(perWindow * 0.25, 1)
  })

  it('gives the same sums when a sample is split between pieces', () => {
    const b = pcm([{ amp: 0.3, seconds: 0.5 }])
    // 7 pieces of an odd size split samples in two
    expect(windowsOf(b, 7)).toEqual(windowsOf(b))
  })

  it('keeps a last window that is not full', () => {
    const w = windowsOf(pcm([{ amp: 1, seconds: 0.03 }]))
    expect(w.sums).toHaveLength(2)
    expect(w.last).toBe(10)
  })
})

describe('levelOf', () => {
  it('maps the fixed dB range to 0-255', () => {
    expect(levelOf(0)).toBe(0)
    expect(levelOf(10 ** (floorDb / 10))).toBe(0)
    expect(levelOf(10 ** (topDb / 10))).toBe(255)
    expect(levelOf(1)).toBe(255)
    expect(levelOf(10 ** (-27 / 10))).toBe(128)
  })
})

describe('slicing a decoded buffer into 32 values', () => {
  it('gives 32 values that follow the level over time', () => {
    // 32 s: quiet for the first half, loud for the second
    const w = windowsOf(
      pcm([
        { amp: 0.02, seconds: 16 },
        { amp: 0.4, seconds: 16 }
      ])
    )
    const c = curveOf(w, 0, w.sums.length)
    expect(c).toHaveLength(points)
    expect([...c.subarray(0, 16)]).toEqual(Array(16).fill(byteAt(db(0.02))))
    expect([...c.subarray(16)]).toEqual(Array(16).fill(byteAt(db(0.4))))
  })

  it('a quiet song stays quiet: the range is fixed, not scaled to the song', () => {
    const w = windowsOf(pcm([{ amp: 0.01, seconds: 4 }]))
    expect(Math.max(...curveOf(w, 0, w.sums.length))).toBeLessThan(80)
  })

  it('silence is 0', () => {
    const w = windowsOf(pcm([{ amp: 0, seconds: 2 }]))
    expect([...curveOf(w, 0, w.sums.length)]).toEqual(Array(points).fill(0))
  })

  it('a song shorter than 32 windows still fills every value', () => {
    const w = windowsOf(pcm([{ amp: 0.5, seconds: 0.1 }]))
    const c = curveOf(w, 0, w.sums.length)
    expect([...c]).toEqual(Array(points).fill(byteAt(db(0.5))))
  })

  it('no samples: all 0', () => {
    expect([...curveOf({ sums: [], perWindow, last: perWindow }, 0, 0)]).toEqual(
      Array(points).fill(0)
    )
  })

  it('gives the page one character per value, 64 levels', () => {
    const text = textOf(Uint8Array.from([0, 128, 255]))
    expect(text).toBe('Ag/')
    expect(decodeCurve(text)).toEqual([0, 32 / 63, 1])
  })
})

describe('CUE splitting', () => {
  // three songs in one image: 10 s quiet, 20 s loud, 6 s middle
  const w = windowsOf(
    pcm([
      { amp: 0.02, seconds: 10 },
      { amp: 0.5, seconds: 20 },
      { amp: 0.1, seconds: 6 }
    ])
  )

  it('gives each song the curve of its own stretch', () => {
    const [a, b, c] = splitCurves(w, [{ start: 0, end: 10 }, { start: 10, end: 30 }, { start: 30 }])
    expect([...a]).toEqual(Array(points).fill(byteAt(db(0.02))))
    expect([...b]).toEqual(Array(points).fill(byteAt(db(0.5))))
    expect([...c]).toEqual(Array(points).fill(byteAt(db(0.1))))
  })

  it('a whole file is one cut', () => {
    const [all] = splitCurves(w, [{ start: 0 }])
    expect(all[0]).toBe(byteAt(db(0.02)))
    expect(all[31]).toBe(byteAt(db(0.1)))
  })

  it('a song that starts past the end gets the last window', () => {
    const [c] = splitCurves(w, [{ start: 100 }])
    expect(c[0]).toBe(byteAt(db(0.1)))
  })
})

describe('the file key', () => {
  const f: LoudFile = {
    path: '/m/a.flac',
    size: 100,
    mtime: 5,
    duration: 60,
    cuts: [{ start: 0 }],
    key: ''
  }
  const curves = [new Uint8Array(points)]

  it('is fresh with the same size and time', () => {
    expect(isFresh({ size: 100, mtime: 5, cuts: '', curves }, f)).toBe(true)
    expect(isFresh(undefined, f)).toBe(false)
  })

  it('a changed size or time means read again', () => {
    expect(isFresh({ size: 101, mtime: 5, cuts: '', curves }, f)).toBe(false)
    expect(isFresh({ size: 100, mtime: 6, cuts: '', curves }, f)).toBe(false)
  })

  it('a file that could not be decoded is not read again until it changes', () => {
    expect(isFresh({ size: 100, mtime: 5, cuts: '' }, f)).toBe(true)
    expect(isFresh({ size: 100, mtime: 5, cuts: 'x' }, f)).toBe(true)
    expect(isFresh({ size: 100, mtime: 9, cuts: '' }, f)).toBe(false)
  })

  it('new cue cuts mean read again', () => {
    const cuts = [{ start: 0, end: 10 }, { start: 10 }]
    const g = { ...f, cuts, key: cutsKey(cuts) }
    expect(g.key).toBe('0-10 10-')
    expect(isFresh({ size: 100, mtime: 5, cuts: '', curves }, g)).toBe(false)
    expect(
      isFresh({ size: 100, mtime: 5, cuts: '0-10 10-', curves: [...curves, ...curves] }, g)
    ).toBe(true)
  })

  it('drops files that went or changed', () => {
    const store: LoudStore = new Map([
      ['/m/a', { size: 1, mtime: 1, cuts: '' }],
      ['/m/b', { size: 1, mtime: 1, cuts: '' }],
      ['/m/c', { size: 1, mtime: 1, cuts: '' }]
    ])
    const files = new Map([
      ['/m/a', { size: 1, mtime: 1 }],
      ['/m/b', { size: 2, mtime: 1 }]
    ])
    expect(pruneLoudness(store, (p) => files.get(p))).toBe(true)
    expect([...store.keys()]).toEqual(['/m/a'])
    expect(pruneLoudness(store, (p) => files.get(p))).toBe(false)
  })
})

describe('loudness.json', () => {
  it('reads back what it wrote', () => {
    const c = Uint8Array.from({ length: points }, (_, i) => i * 8)
    const store: LoudStore = new Map([
      ['/m/a.mp3', { size: 10, mtime: 20, cuts: '', curves: [c] }],
      ['/m/img.flac', { size: 30, mtime: 40, cuts: '0-5 5-', curves: [c, c] }],
      ['/m/bad.wma', { size: 50, mtime: 60, cuts: '' }]
    ])
    const raw = JSON.parse(JSON.stringify(serializeLoudness(store)))
    expect(raw.files['/m/a.mp3'].curves[0]).toHaveLength(44)
    expect(parseLoudness(raw)).toEqual(store)
  })

  it('drops junk', () => {
    expect(parseLoudness(undefined).size).toBe(0)
    expect(parseLoudness({ version: 2, files: {} }).size).toBe(0)
    const files = {
      a: { size: 1, mtime: 1, curves: ['AAAA'] },
      b: { size: -1, mtime: 1 },
      c: 'x',
      d: { size: 1, mtime: 1, curves: [] }
    }
    expect(parseLoudness({ version: 1, files }).size).toBe(0)
  })
})

describe('the plan and the albums', () => {
  const track = (id: string, part?: Track['part']): Track => ({
    id,
    title: id,
    duration: 10,
    albumId: '',
    artist: '',
    album: '',
    no: 0,
    disc: 1,
    codec: '',
    folder: 0,
    ...(part ? { part } : {})
  })
  const album = (id: string, trackIds: string[], cover = ''): Album => ({
    id,
    title: id,
    artist: '',
    year: 0,
    added: 0,
    palette: { dark: ['', '', ''], light: ['', '', ''] },
    cover,
    coverLarge: '',
    trackIds
  })
  // a covered album of two files, then an image split in three by a cue
  // sheet, listed out of time order
  const data = (): LibraryData => ({
    albums: [
      album('covered', ['s1', 's2'], 'spindle://cover/small/x'),
      album('cue', ['c2', 'c1', 'c3'])
    ],
    tracks: [
      track('s1'),
      track('s2'),
      track('c2', { file: 'img', start: 100, end: 250 }),
      track('c1', { file: 'img', start: 0, end: 100 }),
      track('c3', { file: 'img', start: 250 })
    ],
    folders: []
  })
  const paths = new Map([
    ['s1', '/m/s1.mp3'],
    ['s2', '/m/s2.mp3'],
    ['img', '/m/img.flac']
  ])
  const sizes = new Map([...paths.values()].map((p) => [p, { size: 1, mtime: 1, duration: 300 }]))
  const plan = loudPlan(
    data(),
    (id) => paths.get(id),
    (p) => sizes.get(p)
  )
  const curve = (v: number): Uint8Array => new Uint8Array(points).fill(v)

  it('reads albums with no cover first, one decode per image', () => {
    expect(plan.files.map((f) => f.path)).toEqual(['/m/img.flac', '/m/s1.mp3', '/m/s2.mp3'])
    expect(plan.files[0].cuts).toEqual([
      { start: 0, end: 100 },
      { start: 100, end: 250 },
      { start: 250 }
    ])
    expect(plan.songs.get('c2')).toEqual({ path: '/m/img.flac', i: 1 })
    expect(plan.files[1]).toMatchObject({ cuts: [{ start: 0 }], key: '' })
  })

  it('counts songs, not files', () => {
    const store: LoudStore = new Map([
      [
        '/m/img.flac',
        { size: 1, mtime: 1, cuts: plan.files[0].key, curves: [curve(1), curve(2), curve(3)] }
      ]
    ])
    expect(loudCounts(plan, store)).toEqual({ done: 3, total: 5 })
  })

  it('an album gets its curves once every song is read, in its own order', () => {
    const d = data()
    const store: LoudStore = new Map([
      [
        '/m/img.flac',
        { size: 1, mtime: 1, cuts: plan.files[0].key, curves: [curve(0), curve(255), curve(51)] }
      ],
      ['/m/s1.mp3', { size: 1, mtime: 1, cuts: '', curves: [curve(255)] }]
    ])
    addLoudness(d, plan, store, new WeakMap())
    expect(d.albums[1].loudness).toEqual([
      '/'.repeat(points),
      'A'.repeat(points),
      'N'.repeat(points)
    ])
    // s2 is not read yet
    expect(d.albums[0].loudness).toBeUndefined()
    // could not be read: an empty curve, and the album has its picture
    store.set('/m/s2.mp3', { size: 1, mtime: 1, cuts: '' })
    addLoudness(d, plan, store, new WeakMap())
    expect(d.albums[0].loudness).toEqual(['/'.repeat(points), ''])
  })

  it('a changed file is not shown until read again', () => {
    const d = data()
    const store: LoudStore = new Map([
      ['/m/s1.mp3', { size: 9, mtime: 1, cuts: '', curves: [curve(9)] }]
    ])
    store.set('/m/s2.mp3', { size: 1, mtime: 1, cuts: '', curves: [curve(9)] })
    addLoudness(d, plan, store, new WeakMap())
    expect(d.albums[0].loudness).toBeUndefined()
  })

  it('a loose song with its own picture gets its own curve', () => {
    const d = data()
    d.tracks[0].art = { palette: d.albums[0].palette, cover: '', coverLarge: '', seed: 's1' }
    const store: LoudStore = new Map([
      ['/m/s1.mp3', { size: 1, mtime: 1, cuts: '', curves: [curve(255)] }]
    ])
    addLoudness(d, plan, store, new WeakMap())
    expect(d.tracks[0].art?.loudness).toEqual(['/'.repeat(points)])
  })

  it('an album or loose song whose files all failed gets flat bars, not rings', () => {
    const d = data()
    d.tracks[0].art = { palette: d.albums[0].palette, cover: '', coverLarge: '', seed: 's1' }
    const store: LoudStore = new Map([
      ['/m/s1.mp3', { size: 1, mtime: 1, cuts: '' }],
      ['/m/s2.mp3', { size: 1, mtime: 1, cuts: '' }]
    ])
    addLoudness(d, plan, store, new WeakMap())
    expect(d.albums[0].loudness).toEqual(['', ''])
    expect(d.tracks[0].art?.loudness).toEqual([''])
  })

  it('makes the text once per curve', () => {
    const c = curve(255)
    const store: LoudStore = new Map([
      ['/m/s1.mp3', { size: 1, mtime: 1, cuts: '', curves: [c] }],
      ['/m/s2.mp3', { size: 1, mtime: 1, cuts: '', curves: [curve(0)] }]
    ])
    const cache = new WeakMap<Uint8Array, string>()
    addLoudness(data(), plan, store, cache)
    expect(cache.get(c)).toBe('/'.repeat(points))
  })

  it('a file read completes an album only when its last song is in', () => {
    const store: LoudStore = new Map([
      ['/m/s1.mp3', { size: 1, mtime: 1, cuts: '', curves: [curve(9)] }]
    ])
    expect(completes(plan, store, '/m/s1.mp3')).toBe(false)
    store.set('/m/s2.mp3', { size: 1, mtime: 1, cuts: '' })
    expect(completes(plan, store, '/m/s2.mp3')).toBe(true)
    expect(completes(plan, store, '/m/img.flac')).toBe(false)
  })

  it('a loose song with its own picture completes on its own', () => {
    const d = data()
    d.tracks[0].art = { palette: d.albums[0].palette, cover: '', coverLarge: '', seed: 's1' }
    const p = loudPlan(
      d,
      (id) => paths.get(id),
      (x) => sizes.get(x)
    )
    const store: LoudStore = new Map([
      ['/m/s1.mp3', { size: 1, mtime: 1, cuts: '', curves: [curve(9)] }]
    ])
    expect(completes(p, store, '/m/s1.mp3')).toBe(true)
  })
})
