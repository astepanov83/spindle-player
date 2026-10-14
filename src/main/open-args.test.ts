import { describe, expect, it } from 'vitest'
import { maxOpened, OpenBatch, openArgs, parseOpened, type BatchTimers } from './open-args'

describe('openArgs', () => {
  it('takes the paths after the program, leaving out flags', () => {
    const argv = [
      '/opt/Spindle/spindle',
      '--no-sandbox',
      '/music/a.flac',
      '--user-data-dir=/tmp/x',
      '/music/b.mp3'
    ]
    expect(openArgs(argv, '/home/me', 1)).toEqual(['/music/a.flac', '/music/b.mp3'])
  })

  it("skips the app's folder in dev", () => {
    const argv = ['/x/electron', '.', '--remote-debugging-port=9524', '/music/a.flac']
    expect(openArgs(argv, '/home/me', 2)).toEqual(['/music/a.flac'])
  })

  it("makes a relative path from the caller's folder", () => {
    expect(openArgs(['spindle', 'a.flac', '../Jazz', './b c.mp3'], '/home/me/Music', 1)).toEqual([
      '/home/me/Music/a.flac',
      '/home/me/Jazz',
      '/home/me/Music/b c.mp3'
    ])
  })

  it('takes everything after "--" as a path', () => {
    expect(openArgs(['spindle', '--', '-odd name.mp3', '--'], '/m', 1)).toEqual([
      '/m/-odd name.mp3',
      '/m/--'
    ])
  })

  it('reads file URLs, and drops ones that are not paths', () => {
    expect(
      openArgs(['spindle', 'file:///music/My%20Song.flac', 'file://host/x.mp3'], '/m', 1)
    ).toEqual(['/music/My Song.flac'])
  })

  it('keeps the order given, and a path once', () => {
    expect(openArgs(['spindle', 'b.mp3', 'a.mp3', 'b.mp3', ''], '/m', 1)).toEqual([
      '/m/b.mp3',
      '/m/a.mp3'
    ])
  })

  it('gives nothing for a plain start', () => {
    expect(openArgs(['spindle'], '/m', 1)).toEqual([])
    expect(openArgs(['electron', '.'], '/m', 2)).toEqual([])
  })

  it('cuts a very long list', () => {
    const many = Array.from({ length: maxOpened + 5 }, (_, i) => `/m/${i}.mp3`)
    expect(openArgs(['spindle', ...many], '/m', 1)).toHaveLength(maxOpened)
  })
})

describe('parseOpened', () => {
  it('keeps absolute paths only', () => {
    expect(parseOpened(['/m/a.mp3', 'rel.mp3', 3, null, '/m/b.mp3'])).toEqual([
      '/m/a.mp3',
      '/m/b.mp3'
    ])
  })

  it('takes nothing that is not a list', () => {
    for (const v of [undefined, '/m/a.mp3', { 0: '/m/a.mp3' }])
      expect(parseOpened(v)).toBeUndefined()
  })
})

// timers run by hand
function clock(): BatchTimers & { at: number; run(ms: number): void } {
  let jobs: { at: number; f: () => void }[] = []
  const c = {
    at: 0,
    now: () => c.at,
    set: (f: () => void, ms: number) => {
      const job = { at: c.at + ms, f }
      jobs.push(job)
      return () => (jobs = jobs.filter((j) => j !== job))
    },
    run(ms: number) {
      const until = c.at + ms
      for (;;) {
        const next = jobs.filter((j) => j.at <= until).sort((a, b) => a.at - b.at)[0]
        if (!next) break
        jobs = jobs.filter((j) => j !== next)
        c.at = next.at
        next.f()
      }
      c.at = until
    }
  }
  return c
}

describe('OpenBatch', () => {
  it('keeps the order of one launch', () => {
    const c = clock()
    const got: string[][] = []
    const b = new OpenBatch((p) => got.push(p), 500, 3000, c)
    b.add(['/m/10.mp3', '/m/2.mp3'])
    c.run(499)
    expect(got).toEqual([])
    c.run(1)
    expect(got).toEqual([['/m/10.mp3', '/m/2.mp3']])
  })

  it('joins launches close together and sorts them by path', () => {
    const c = clock()
    const got: string[][] = []
    const b = new OpenBatch((p) => got.push(p), 500, 3000, c)
    b.add(['/m/10 c.mp3'])
    c.run(300)
    b.add(['/m/2 b.mp3'])
    c.run(300)
    b.add(['/m/1 a.mp3', '/m/2 b.mp3'])
    c.run(500)
    expect(got).toEqual([['/m/1 a.mp3', '/m/2 b.mp3', '/m/10 c.mp3']])
  })

  it('ends a long run of launches after the longest wait', () => {
    const c = clock()
    const got: string[][] = []
    const b = new OpenBatch((p) => got.push(p), 500, 1000, c)
    for (let i = 0; i < 5; i++) {
      b.add([`/m/${i}.mp3`])
      c.run(400)
    }
    expect(got).toHaveLength(1)
    expect(got[0]).toEqual(['/m/0.mp3', '/m/1.mp3', '/m/2.mp3'])
  })

  it('starts a new batch after one ended', () => {
    const c = clock()
    const got: string[][] = []
    const b = new OpenBatch((p) => got.push(p), 500, 3000, c)
    b.add(['/m/b.mp3'])
    c.run(600)
    b.add(['/m/a.mp3'])
    c.run(600)
    expect(got).toEqual([['/m/b.mp3'], ['/m/a.mp3']])
  })

  it('ignores a launch with no paths', () => {
    const c = clock()
    const got: string[][] = []
    new OpenBatch((p) => got.push(p), 500, 3000, c).add([])
    c.run(5000)
    expect(got).toEqual([])
  })
})
