import { execFileSync } from 'child_process'
import { chmodSync, copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { points, type Cut } from './loudness'
import { canRead, readLoudness, type ReadOutcome } from './loudness-read'

const ffmpeg = join(__dirname, '../../../../resources/ffmpeg/ffmpeg')

describe.skipIf(!existsSync(ffmpeg))('readLoudness with the bundled ffmpeg', () => {
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'spindle-loud-'))
    // 4 s quiet, then 4 s loud, as stereo FLAC at 44.1 kHz
    execFileSync(ffmpeg, [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=4,volume=0.02',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=4,volume=0.9',
      '-filter_complex',
      '[0][1]concat=n=2:v=0:a=1,pan=stereo|c0=c0|c1=c0',
      '-ar',
      '44100',
      join(dir, 'two.flac')
    ])
    writeFileSync(join(dir, 'junk.mp3'), 'not audio at all')
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  const read = (
    name: string,
    cuts: Cut[] = [{ start: 0 }],
    signal = new AbortController().signal
  ): Promise<ReadOutcome> => readLoudness(ffmpeg, join(dir, name), 8, cuts, signal)

  it('gives 32 values that follow the file', async () => {
    const o = await read('two.flac')
    expect(o.kind).toBe('ok')
    const [c] = (o as { curves: Uint8Array[] }).curves
    expect(c).toHaveLength(points)
    expect(c[2]).toBeLessThan(c[29] - 100)
  })

  it('splits one decode by the cuts', async () => {
    const o = await read('two.flac', [{ start: 0, end: 4 }, { start: 4 }])
    const [quiet, loud] = (o as { curves: Uint8Array[] }).curves
    expect(Math.max(...quiet)).toBeLessThan(Math.min(...loud) - 100)
  })

  it('a file ffmpeg cannot decode is bad, with why', async () => {
    const o = await read('junk.mp3')
    expect(o.kind).toBe('bad')
    expect((o as { why: string }).why).toMatch(/Invalid data|could not find|Error/i)
  })

  it('a file that cannot be opened is for later, not bad (a drive gone away)', async () => {
    expect((await read('missing.flac')).kind).toBe('later')
    const locked = join(dir, 'locked.flac')
    copyFileSync(join(dir, 'two.flac'), locked)
    chmodSync(locked, 0)
    // root can read it anyway
    if (!(await canRead(locked))) expect((await read('locked.flac')).kind).toBe('later')
  })

  it('canRead tells a readable file from a missing one', async () => {
    expect(await canRead(join(dir, 'two.flac'))).toBe(true)
    expect(await canRead(join(dir, 'missing.flac'))).toBe(false)
  })

  it('ffmpeg that cannot run is nostart', async () => {
    const o = await readLoudness(
      join(dir, 'junk.mp3'),
      join(dir, 'two.flac'),
      8,
      [{ start: 0 }],
      new AbortController().signal
    )
    expect(o.kind).toBe('nostart')
  })

  it('a stop ends the read as stopped', async () => {
    const stop = new AbortController()
    const p = read('two.flac', [{ start: 0 }], stop.signal)
    stop.abort()
    expect(await p).toEqual({ kind: 'stopped' })
  })
})
