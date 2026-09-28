import { describe, expect, it } from 'vitest'
import { FirstFill, ScanChain, Stopped } from './scan-chain'

// A promise with its resolve at hand.
function later<T = void>(): { p: Promise<T>; done: (v: T) => void } {
  let done!: (v: T) => void
  const p = new Promise<T>((r) => (done = r))
  return { p, done }
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

// A chain whose scans and prunes wait until the test lets them go, and a log
// of what happened in order.
function setup(ready: Promise<unknown> = Promise.resolve()): {
  chain: ScanChain
  events: string[]
  logs: string[]
  wakes: () => number
  scan: (name: string) => { run: (gen: number) => Promise<void>; finish: () => void }
  prunes: Map<number, () => void>
} {
  const events: string[] = []
  const logs: string[] = []
  const prunes = new Map<number, () => void>()
  let wakes = 0
  const chain = new ScanChain(ready, {
    prune: async (gen) => {
      events.push(`prune ${gen}`)
      const l = later()
      prunes.set(gen, l.done)
      await l.p
      events.push(chain.stale(gen) ? `prune ${gen} stopped` : `prune ${gen} done`)
    },
    wake: () => void wakes++,
    stopped: () => void events.push('idle'),
    log: (t) => logs.push(t)
  })
  // A scan that checks its number, like the real one, until finish() or a stop.
  const scan = (name: string): { run: (gen: number) => Promise<void>; finish: () => void } => {
    const l = later()
    return {
      finish: () => l.done(),
      run: async (gen) => {
        events.push(`${name} starts`)
        const waiting = l.p
        // the real scan wakes up on wake() and checks; here a poll does it
        while (!chain.stale(gen)) {
          const r = await Promise.race([waiting.then(() => 'done'), flush().then(() => 'poll')])
          if (r === 'done') break
        }
        try {
          chain.check(gen)
        } catch (e) {
          events.push(`${name} stopped`)
          throw e
        }
        events.push(`${name} done`)
      }
    }
  }
  return { chain, events, logs, wakes: () => wakes, scan, prunes }
}

describe('ScanChain', () => {
  it('waits for the index to be read', async () => {
    const r = later()
    const { chain, events, scan } = setup(r.p)
    const a = scan('a')
    void chain.request(a.run)
    await flush()
    expect(events).toEqual([])
    r.done()
    await flush()
    expect(events).toEqual(['a starts'])
  })

  it('prunes after a scan that ran to the end', async () => {
    const { chain, events, scan, prunes } = setup()
    const a = scan('a')
    const done = chain.request(a.run)
    await flush()
    a.finish()
    await flush()
    prunes.get(1)!()
    await done
    expect(events).toEqual(['a starts', 'a done', 'prune 1', 'prune 1 done'])
  })

  it('stops the running scan and starts the new one after it let go', async () => {
    const { chain, events, scan, prunes, wakes } = setup()
    const a = scan('a')
    const b = scan('b')
    void chain.request(a.run)
    await flush()
    const done = chain.request(b.run)
    expect(wakes()).toBe(2)
    await flush()
    await flush()
    b.finish()
    await flush()
    prunes.get(2)!()
    await done
    // no prune for the stopped one, and b never ran next to a
    expect(events).toEqual([
      'a starts',
      'a stopped',
      'b starts',
      'b done',
      'prune 2',
      'prune 2 done'
    ])
  })

  it('never runs a scan replaced while it waited', async () => {
    const r = later()
    const { chain, events, scan, prunes } = setup(r.p)
    const a = scan('a')
    const b = scan('b')
    void chain.request(a.run)
    const done = chain.request(b.run)
    r.done()
    await flush()
    b.finish()
    await flush()
    prunes.get(2)!()
    await done
    expect(events).toEqual(['b starts', 'b done', 'prune 2', 'prune 2 done'])
  })

  it('starts a new scan only after the last prune ended', async () => {
    const { chain, events, scan, prunes } = setup()
    const a = scan('a')
    const b = scan('b')
    void chain.request(a.run)
    await flush()
    a.finish()
    await flush()
    expect(events.at(-1)).toBe('prune 1')
    const done = chain.request(b.run)
    await flush()
    // the prune is still out: b waits
    expect(events).not.toContain('b starts')
    prunes.get(1)!()
    await flush()
    await flush()
    expect(events.slice(-2)).toEqual(['prune 1 stopped', 'b starts'])
    b.finish()
    await flush()
    prunes.get(2)!()
    await done
  })

  it('stop ends the scan with no prune, and keeps the chain working', async () => {
    const { chain, events, scan, prunes } = setup()
    const a = scan('a')
    const first = chain.request(a.run)
    await flush()
    chain.stop()
    await first
    // nothing newer is waiting, so the status goes back to idle
    expect(events).toEqual(['a starts', 'a stopped', 'idle'])
    const b = scan('b')
    const done = chain.request(b.run)
    await flush()
    b.finish()
    await flush()
    prunes.get(3)!()
    await done
    expect(events.slice(3)).toEqual(['b starts', 'b done', 'prune 3', 'prune 3 done'])
  })

  it('is busy from a scan asked for until its prune ended, or it stopped', async () => {
    const { chain, scan, prunes } = setup()
    await flush()
    expect(chain.busy).toBe(false)
    const a = scan('a')
    const first = chain.request(a.run)
    expect(chain.busy).toBe(true)
    await flush()
    a.finish()
    await flush()
    // the prune still runs
    expect(chain.busy).toBe(true)
    prunes.get(1)!()
    await first
    expect(chain.busy).toBe(false)
    const b = scan('b')
    const second = chain.request(b.run)
    await flush()
    chain.stop()
    await second
    expect(chain.busy).toBe(false)
  })

  it('starts nothing after close', async () => {
    const { chain, events, scan } = setup()
    const a = scan('a')
    const first = chain.request(a.run)
    await flush()
    chain.close()
    await first
    await chain.request(scan('b').run)
    expect(events).toEqual(['a starts', 'a stopped'])
  })

  it('logs a failed scan, prunes after it, and runs the next one', async () => {
    const { chain, events, logs, scan, prunes } = setup()
    const failed = chain.request(async () => {
      throw new Error('disk on fire')
    })
    await flush()
    prunes.get(1)!()
    await failed
    expect(logs).toEqual(['Library scan failed: Error: disk on fire'])
    expect(events).toEqual(['prune 1', 'prune 1 done'])
    const b = scan('b')
    const done = chain.request(b.run)
    await flush()
    b.finish()
    await flush()
    prunes.get(2)!()
    await done
    expect(events).toContain('b done')
  })

  it('tells a stopped scan by Stopped', () => {
    const { chain } = setup()
    chain.stop()
    expect(() => chain.check(0)).toThrow(Stopped)
    expect(() => chain.check(chain.gen)).not.toThrow()
  })
})

describe('FirstFill', () => {
  it('is on while the page has no songs, until a scan ends', () => {
    const f = new FirstFill()
    f.start(true)
    expect(f.on).toBe(true)
    f.end()
    expect(f.on).toBe(false)
  })

  it('stays on for the next scan when the first one was stopped', () => {
    const f = new FirstFill()
    f.start(true)
    // stopped by Add folder after an interim update gave the page some songs
    f.start(false)
    expect(f.on).toBe(true)
  })

  it('is off for a library the page already shows', () => {
    const f = new FirstFill()
    f.start(false)
    expect(f.on).toBe(false)
  })
})
