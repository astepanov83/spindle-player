import { describe, expect, it } from 'vitest'
import type { LoudFile } from './loudness'
import { LoudQueue, songStartMs, type LoudDeps } from './loudness-queue'
import type { ReadOutcome } from './loudness-read'

const file = (path: string): LoudFile => ({
  path,
  size: 1,
  mtime: 1,
  duration: 1,
  cuts: [{ start: 0 }],
  key: ''
})

interface Setup {
  q: LoudQueue
  s: { can: boolean; playing: boolean; now: number }
  reads: Map<string, { end: (o: ReadOutcome) => void; signal: AbortSignal }>
  done: string[]
  tick(ms: number): Promise<void>
  end(path: string, o?: ReadOutcome): Promise<void>
}

// Reads end when the test says; the clock and timers are fake.
function setup(paths: string[]): Setup {
  const left = paths.map(file)
  const reads = new Map<string, { end: (o: ReadOutcome) => void; signal: AbortSignal }>()
  const done: string[] = []
  const timers: { at: number; f: () => void }[] = []
  const s = { can: true, playing: false, now: 0 }
  const deps: LoudDeps = {
    next: (running) => left.find((f) => !running.has(f.path) && !done.includes(f.path)),
    read: (f, signal) => new Promise((end) => reads.set(f.path, { end, signal })),
    done: (f) => done.push(f.path),
    canRun: () => s.can,
    playing: () => s.playing,
    now: () => s.now,
    setTimer: (f, ms) => {
      const t = { at: s.now + ms, f }
      timers.push(t)
      return () => timers.splice(timers.indexOf(t), 1)
    }
  }
  const q = new LoudQueue(deps)
  const tick = async (ms: number): Promise<void> => {
    s.now += ms
    for (const t of timers.filter((t) => t.at <= s.now)) {
      timers.splice(timers.indexOf(t), 1)
      t.f()
    }
    await Promise.resolve()
  }
  const end = async (path: string, o: ReadOutcome = { kind: 'ok', curves: [] }): Promise<void> => {
    reads.get(path)!.end(o)
    reads.delete(path)
    await new Promise((r) => setTimeout(r, 0))
  }
  return { q, s, reads, done, tick, end }
}

describe('LoudQueue', () => {
  it('reads two files at a time, one while a song plays', async () => {
    const t = setup(['a', 'b', 'c', 'd'])
    t.q.kick()
    expect([...t.reads.keys()]).toEqual(['a', 'b'])
    t.s.playing = true
    await t.end('a')
    await t.end('b')
    expect([...t.reads.keys()]).toEqual(['c'])
    expect(t.done).toEqual(['a', 'b'])
  })

  it('starts nothing while it may not run, and goes on when kicked', async () => {
    const t = setup(['a'])
    t.s.can = false
    t.q.kick()
    expect(t.reads.size).toBe(0)
    t.s.can = true
    t.q.kick()
    expect([...t.reads.keys()]).toEqual(['a'])
  })

  it('starts no new file for a while after a song starts', async () => {
    const t = setup(['a', 'b'])
    t.s.playing = true
    t.q.kick()
    t.q.hold()
    // the read that runs goes on
    await t.end('a')
    expect(t.reads.size).toBe(0)
    await t.tick(songStartMs - 1)
    expect(t.reads.size).toBe(0)
    await t.tick(1)
    expect([...t.reads.keys()]).toEqual(['b'])
  })

  it('rests as long as a read took while a song plays', async () => {
    const t = setup(['a', 'b'])
    t.s.playing = true
    t.q.kick()
    await t.tick(300)
    await t.end('a')
    expect(t.reads.size).toBe(0)
    await t.tick(299)
    expect(t.reads.size).toBe(0)
    await t.tick(1)
    expect([...t.reads.keys()]).toEqual(['b'])
  })

  it('no rest while nothing plays', async () => {
    const t = setup(['a', 'b', 'c'])
    t.q.kick()
    await t.tick(300)
    await t.end('a')
    expect([...t.reads.keys()]).toEqual(['b', 'c'])
  })

  it('a stopped read is not done, and is read again later', async () => {
    const t = setup(['a'])
    t.q.kick()
    const { signal } = t.reads.get('a')!
    t.q.stop()
    expect(signal.aborted).toBe(true)
    await t.end('a', { kind: 'stopped' })
    expect(t.done).toEqual([])
    t.q.kick()
    expect([...t.reads.keys()]).toEqual(['a'])
  })

  it('a bad file is done, so it is not read again', async () => {
    const t = setup(['a', 'b'])
    t.s.playing = true
    t.q.kick()
    await t.end('a', { kind: 'bad' })
    expect(t.done).toEqual(['a'])
    expect([...t.reads.keys()]).toEqual(['b'])
  })
})
