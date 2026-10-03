import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LibraryProcess, type AfterExit, type Child } from './library-process'
import { RestartBudget } from '../../restart'
import type { WorkerIn, WorkerStart } from './types'

// Stands in for Electron's UtilityProcess.
class FakeChild extends EventEmitter {
  sent: WorkerIn[] = []
  postMessage(m: WorkerIn): void {
    this.sent.push(m)
  }
}

const start: WorkerStart = {
  indexPath: '/u/library.json',
  coversDir: '/u/covers',
  folders: ['/m'],
  fetch: { on: false, sources: { musicbrainz: true, deezer: true, itunes: true } },
  fetchedPath: '/u/fetched-covers.json',
  overridesPath: '/u/artist-overrides.json',
  userAgent: 'Spindle/test',
  keepCovers: [],
  on: true
}

function setup(): {
  proc: LibraryProcess
  children: FakeChild[]
  exits: [number, AfterExit][]
  logs: string[]
} {
  const children: FakeChild[] = []
  const exits: [number, AfterExit][] = []
  const logs: string[] = []
  const proc = new LibraryProcess(
    () => {
      const c = new FakeChild()
      children.push(c)
      return c as unknown as Child
    },
    () => start,
    new RestartBudget(3, 60000),
    {
      message: () => {},
      exit: (code, after) => exits.push([code, after]),
      started: () => {}
    },
    2000,
    (t) => logs.push(t)
  )
  proc.start()
  return { proc, children, exits, logs }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('LibraryProcess', () => {
  it('sends the start data as the first message', () => {
    const { children } = setup()
    expect(children[0].sent[0]).toEqual({ type: 'start', start })
  })

  it('flush resolves when the process answers that it saved', async () => {
    const { proc, children, logs } = setup()
    let done = false
    void proc.flush().then(() => (done = true))
    expect(children[0].sent.at(-1)).toEqual({ type: 'flush' })
    await Promise.resolve()
    expect(done).toBe(false)
    children[0].emit('message', { type: 'flushed' })
    await vi.advanceTimersByTimeAsync(0)
    expect(done).toBe(true)
    expect(logs).toEqual([])
  })

  it('flush resolves when the process ends first, and it is not started again', async () => {
    const { proc, children, exits } = setup()
    let done = false
    void proc.flush().then(() => (done = true))
    children[0].emit('exit', 1)
    await vi.advanceTimersByTimeAsync(0)
    expect(done).toBe(true)
    expect(exits).toEqual([[1, 'quitting']])
    expect(children).toHaveLength(1)
  })

  it('flush gives up after the wait', async () => {
    const { proc, logs } = setup()
    let done = false
    void proc.flush().then(() => (done = true))
    await vi.advanceTimersByTimeAsync(1999)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(done).toBe(true)
    expect(logs[0]).toMatch(/did not save in time/)
  })

  it('flush with no process resolves at once', async () => {
    const { proc, children } = setup()
    children[0].emit('exit', 1)
    children[1].emit('exit', 1)
    children[2].emit('exit', 1)
    children[3].emit('exit', 1)
    expect(proc.running).toBe(false)
    let done = false
    void proc.flush().then(() => (done = true))
    await vi.advanceTimersByTimeAsync(0)
    expect(done).toBe(true)
  })

  it('logs a fatal error instead of throwing, and starts a new process on exit', () => {
    const { children, exits, logs } = setup()
    expect(() => children[0].emit('error', 'FatalError', 'v8::Heap', '')).not.toThrow()
    expect(logs[0]).toMatch(/FatalError/)
    children[0].emit('exit', 134)
    expect(exits).toEqual([[134, 'restarted']])
    expect(children).toHaveLength(2)
    expect(children[1].sent[0].type).toBe('start')
  })

  it('stops starting new processes after too many exits', () => {
    const { children, exits } = setup()
    for (let i = 0; i < 4; i++) children[i].emit('exit', 1)
    expect(exits.map((e) => e[1])).toEqual(['restarted', 'restarted', 'restarted', 'given-up'])
    expect(children).toHaveLength(4)
  })

  it('ignores messages from a process that was replaced', () => {
    const message = vi.fn()
    const children: FakeChild[] = []
    const proc = new LibraryProcess(
      () => {
        const c = new FakeChild()
        children.push(c)
        return c as unknown as Child
      },
      () => start,
      new RestartBudget(3, 60000),
      { message, exit: () => {}, started: () => {} }
    )
    proc.start()
    children[0].emit('exit', 1)
    children[0].emit('message', { type: 'log', text: 'old' })
    children[1].emit('message', { type: 'log', text: 'new' })
    expect(message).toHaveBeenCalledTimes(1)
    expect(message).toHaveBeenCalledWith({ type: 'log', text: 'new' })
  })
})
