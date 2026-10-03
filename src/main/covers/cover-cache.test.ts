// CoverCache with a fake hidden window: what happens when a send throws, when
// the window never loads, and after the app window closed.
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  windows: [] as FakeWindow[],
  // how the next window's load goes
  load: 'ok' as 'ok' | 'hang',
  sendThrows: false,
  onDone: undefined as undefined | ((e: unknown, r: unknown) => void)
}))

interface FakeWindow {
  destroyed: boolean
  sent: { id: number; side?: number }[]
  webContents: unknown
  handlers: Map<string, (...args: unknown[]) => void>
}

vi.mock('electron', () => {
  class BrowserWindow {
    destroyed = false
    sent: { id: number }[] = []
    handlers = new Map<string, (...args: unknown[]) => void>()
    webContents = {
      on: (event: string, fn: (...args: unknown[]) => void) => this.handlers.set(event, fn),
      setWindowOpenHandler: () => {},
      send: (_: string, job: { id: number }) => {
        if (fake.sendThrows) throw new Error('send failed')
        this.sent.push(job)
      }
    }
    constructor() {
      fake.windows.push(this)
    }
    on(): this {
      return this
    }
    isDestroyed(): boolean {
      return this.destroyed
    }
    destroy(): void {
      this.destroyed = true
    }
    loadURL(): Promise<void> {
      return fake.load === 'ok' ? Promise.resolve() : new Promise(() => {})
    }
  }
  return {
    BrowserWindow,
    ipcMain: { on: (_: string, fn: (e: unknown, r: unknown) => void) => (fake.onDone = fn) }
  }
})

const { CoverCache } = await import('./cover-cache')
const { fallbackPalettes } = await import('../../shared/palette')
type CoverJob = import('../../shared/cover-job').CoverJob

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'spindle-covers-'))
  fake.windows = []
  fake.load = 'ok'
  fake.sendThrows = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

const hash = 'a'.repeat(40)
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('CoverCache', () => {
  it('ends a job as retry when the send throws, and keeps the window', async () => {
    vi.useFakeTimers()
    const covers = new CoverCache(dir, 'preload.js')
    fake.sendThrows = true
    const done = covers.add(hash, new Uint8Array([1]))
    await vi.advanceTimersByTimeAsync(0)
    expect(await done).toEqual({ result: 'retry' })
    // the job's 20s timeout must not fire later and drop a window that is fine
    await vi.advanceTimersByTimeAsync(25000)
    expect(fake.windows).toHaveLength(1)
    expect(fake.windows[0].destroyed).toBe(false)
    covers.close()
  })

  it('drops a window whose load hangs, and makes a new one for the next job', async () => {
    vi.useFakeTimers()
    const covers = new CoverCache(dir, 'preload.js')
    fake.load = 'hang'
    const first = covers.add(hash, new Uint8Array([1]))
    await vi.advanceTimersByTimeAsync(11000)
    expect(await first).toEqual({ result: 'retry' })
    expect(fake.windows[0].destroyed).toBe(true)
    fake.load = 'ok'
    const second = covers.palette(hash, new Uint8Array([1]))
    await vi.advanceTimersByTimeAsync(0)
    expect(fake.windows).toHaveLength(2)
    // bad twice: with others, then alone
    for (const n of [0, 1]) {
      const job = fake.windows[1].sent[n]
      fake.onDone!({ sender: fake.windows[1].webContents }, { id: job.id, bad: true })
      await vi.advanceTimersByTimeAsync(0)
    }
    expect(await second).toEqual({ result: 'rebuild' })
    covers.close()
  })

  it('opens no window after the app window closed, until allowed again', async () => {
    const covers = new CoverCache(dir, 'preload.js')
    covers.shutDown()
    expect(await covers.add(hash, new Uint8Array([1]))).toEqual({ result: 'retry' })
    expect(await covers.large(hash, async () => new Uint8Array([1]))).toBeUndefined()
    expect(fake.windows).toHaveLength(0)
    expect(readdirSync(dir)).toEqual([])
    covers.allow()
    const p = covers.palette(hash, new Uint8Array([1]))
    await tick()
    expect(fake.windows).toHaveLength(1)
    covers.close()
    expect(await p).toEqual({ result: 'retry' })
  })

  // answers every job the window has not answered yet
  function answer(w: FakeWindow, done: Set<number>, r: (id: number) => object): void {
    for (const job of w.sent)
      if (!done.has(job.id)) {
        done.add(job.id)
        fake.onDone!({ sender: w.webContents }, { id: job.id, ...r(job.id) })
      }
  }

  it('tries each picture alone after a crash, and marks only the one that crashes alone', async () => {
    const covers = new CoverCache(dir, 'preload.js')
    const hashes = ['1', '2', '3'].map((c) => c.repeat(40))
    const results = hashes.map((h, i) => covers.add(h, new Uint8Array([i])))
    await tick()
    expect(fake.windows[0].sent).toHaveLength(3)
    fake.windows[0].handlers.get('render-process-gone')!({}, { reason: 'crashed' })
    // each one runs alone, one at a time; the window is new after each crash
    const seen: number[] = []
    const answered = new Set<number>()
    for (let i = 0; i < 3; i++) {
      await tick()
      const w = fake.windows.at(-1)!
      const open = w.sent.filter((j) => !answered.has(j.id))
      expect(open).toHaveLength(1)
      answered.add(open[0].id)
      const pic = open[0] as unknown as { data: Uint8Array }
      seen.push(pic.data[0])
      if (pic.data[0] === 1) w.handlers.get('render-process-gone')!({}, { reason: 'crashed' })
      else fake.onDone!({ sender: w.webContents }, { id: open[0].id, jpg: new Uint8Array([9]) })
    }
    expect(seen).toEqual([0, 1, 2])
    expect((await Promise.all(results)).map((r) => r.result)).toEqual(['ok', 'bad', 'ok'])
    expect(readdirSync(dir).sort()).toEqual(
      [`${hashes[0]}.jpg`, `${hashes[1]}.bad`, `${hashes[2]}.jpg`].sort()
    )
    covers.close()
  })

  it('keeps a picture that decodes when tried alone', async () => {
    const covers = new CoverCache(dir, 'preload.js')
    const p = covers.add(hash, new Uint8Array([1]))
    await tick()
    const w = fake.windows[0]
    const done = new Set<number>()
    answer(w, done, () => ({ bad: true }))
    await tick()
    expect(w.sent).toHaveLength(2)
    answer(w, done, () => ({ jpg: new Uint8Array([9]) }))
    expect(await p).toEqual({ result: 'ok' })
    expect(readdirSync(dir)).toEqual([`${hash}.jpg`])
    covers.close()
  })

  describe('station logos', () => {
    const palette = fallbackPalettes('logo')

    // answers each job as it comes, with a picture of this size
    async function answerAll(w: FakeWindow, width: number, height: number): Promise<void> {
      const done = new Set<number>()
      for (let i = 0; i < 5; i++) {
        await tick()
        answer(w, done, () => ({ jpg: new Uint8Array([9]), palette, width, height }))
      }
    }

    it('makes the small and the large cover, with the backdrop, and gives the colors and size', async () => {
      const covers = new CoverCache(dir, 'preload.js')
      const p = covers.addLogo(hash, new Uint8Array([1]))
      await tick()
      await answerAll(fake.windows[0], 300, 200)
      expect(await p).toEqual({ palette, side: 200 })
      const jobs = fake.windows[0].sent as unknown as CoverJob[]
      expect(jobs.map((j) => [j.side, !!j.palette, j.backdrop])).toEqual([
        [320, true, true],
        [1000, false, true]
      ])
      expect(readdirSync(dir).sort()).toEqual([`${hash}-large.jpg`, `${hash}.jpg`])
      expect(await covers.hasLogo(hash, false)).toBe(true)
      expect(await covers.hasLogo(hash, true)).toBe(true)
      covers.close()
    })

    it('makes no large cover for a small logo', async () => {
      const covers = new CoverCache(dir, 'preload.js')
      const p = covers.addLogo(hash, new Uint8Array([1]))
      await tick()
      await answerAll(fake.windows[0], 48, 48)
      expect(await p).toEqual({ palette, side: 48 })
      expect(readdirSync(dir)).toEqual([`${hash}.jpg`])
      covers.close()
    })

    it('picks new colors from the small cover with a palette-only job', async () => {
      const covers = new CoverCache(dir, 'preload.js')
      writeFileSync(join(dir, `${hash}.jpg`), new Uint8Array([7, 7]))
      const p = covers.logoPalette(hash)
      await tick()
      await tick()
      const job = fake.windows[0].sent[0] as unknown as CoverJob
      expect([job.side, job.palette, [...job.data]]).toEqual([undefined, true, [7, 7]])
      fake.onDone!({ sender: fake.windows[0].webContents }, { id: job.id, palette })
      expect(await p).toEqual(palette)
      // no small cover: nothing to pick from
      expect(await covers.logoPalette('b'.repeat(40))).toBeUndefined()
      covers.close()
    })

    it('gives nothing for a picture that is not one, and marks nothing', async () => {
      const covers = new CoverCache(dir, 'preload.js')
      const p = covers.addLogo(hash, new Uint8Array([1]))
      await tick()
      const done = new Set<number>()
      for (let i = 0; i < 3; i++) {
        answer(fake.windows[0], done, () => ({ bad: true }))
        await tick()
      }
      expect(await p).toBeUndefined()
      expect(readdirSync(dir)).toEqual([])
      expect(await covers.hasLogo(hash, false)).toBe(false)
      covers.close()
    })
  })

  describe('artist mosaics', () => {
    const four = ['1', '2', '3', '4'].map((c) => c.repeat(40))
    const name = `${four.join('-')}.mosaic.jpg`

    it('makes the mosaic from the 4 small covers once, and serves the file after', async () => {
      four.forEach((h, i) => writeFileSync(join(dir, `${h}.jpg`), new Uint8Array([i])))
      const covers = new CoverCache(dir, 'preload.js')
      const p = covers.mosaic(four)
      // a second tile asking at once gets the same job
      const again = covers.mosaic(four)
      for (let i = 0; i < 3; i++) await tick()
      const sent = fake.windows[0].sent as unknown as CoverJob[]
      expect(sent).toHaveLength(1)
      expect([sent[0].side, [...sent[0].data], sent[0].more?.map((m) => [...m])]).toEqual([
        320,
        [0],
        [[1], [2], [3]]
      ])
      fake.onDone!(
        { sender: fake.windows[0].webContents },
        { id: sent[0].id, jpg: new Uint8Array([9]) }
      )
      expect(await p).toBe(join(dir, name))
      expect(await again).toBe(join(dir, name))
      expect(await covers.mosaic(four)).toBe(join(dir, name))
      expect(fake.windows[0].sent).toHaveLength(1)
      covers.close()
    })

    it('gives nothing when a small cover is missing, and sends no job', async () => {
      writeFileSync(join(dir, `${four[0]}.jpg`), new Uint8Array([0]))
      const covers = new CoverCache(dir, 'preload.js')
      expect(await covers.mosaic(four)).toBeUndefined()
      expect(fake.windows).toHaveLength(0)
      covers.close()
    })
  })
})
