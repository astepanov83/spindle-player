// Starts the library process and keeps it running: restarts it when it dies
// (a few times), and lets quitting wait for its last save. Plain TS with the
// process handed in, so it is tested with a fake.
import type { RestartBudget } from './restart'
import type { WorkerIn, WorkerOut, WorkerStart } from './types'

// The part of Electron's UtilityProcess used here.
export interface Child {
  postMessage(message: WorkerIn): void
  on(event: 'message', listener: (message: WorkerOut) => void): this
  on(event: 'exit', listener: (code: number) => void): this
  on(event: 'error', listener: (type: string, location: string, report: string) => void): this
}

// What follows a process that ended: a new one, none (it died too often), or
// none since the app is quitting.
export type AfterExit = 'restarted' | 'given-up' | 'quitting'

export interface ProcessEvents {
  message(m: WorkerOut): void
  exit(code: number, after: AfterExit): void
  // a new process is running, for main to send it what it needs to know
  started(): void
}

export class LibraryProcess {
  #child: Child | undefined
  #quitting = false
  // set once quitting asked for the last save; called when it is done
  #flushed: (() => void) | undefined
  #flushing = Promise.resolve()

  constructor(
    readonly fork: () => Child,
    readonly startData: () => WorkerStart,
    readonly restarts: RestartBudget,
    readonly events: ProcessEvents,
    readonly flushWaitMs = 2000,
    readonly log: (text: string) => void = (t) => console.error(t)
  ) {}

  get running(): boolean {
    return !!this.#child
  }

  start(): void {
    const child = this.fork()
    this.#child = child
    child.on('message', (m) => {
      if (this.#child !== child) return
      if (m.type === 'flushed') this.#flushed?.()
      else this.events.message(m)
    })
    // a fatal V8 error in the child (out of memory); 'exit' follows. With no
    // listener, the EventEmitter would throw in main.
    child.on('error', (type, location) =>
      this.log(`Library process failed: ${type} at ${location}`)
    )
    child.on('exit', (code) => {
      if (this.#child !== child) return
      this.#child = undefined
      this.#flushed?.()
      const after: AfterExit = this.#quitting
        ? 'quitting'
        : this.restarts.take(Date.now())
          ? 'restarted'
          : 'given-up'
      this.events.exit(code, after)
      if (after === 'restarted') this.start()
    })
    // the start data goes first; the process waits for it before anything else
    child.postMessage({ type: 'start', start: this.startData() })
    this.events.started()
  }

  post(m: WorkerIn): boolean {
    if (!this.#child) return false
    this.#child.postMessage(m)
    return true
  }

  // Quitting: lets the process write the index, waiting a short while at most.
  // Resolves at once when there is nothing to wait for.
  flush(): Promise<void> {
    this.#quitting = true
    if (this.#flushed) return this.#flushing
    this.#flushing = new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.log('Library index: the library process did not save in time')
        resolve()
      }, this.flushWaitMs)
      this.#flushed = () => {
        clearTimeout(timer)
        resolve()
      }
      if (!this.post({ type: 'flush' })) this.#flushed()
    })
    return this.#flushing
  }
}
