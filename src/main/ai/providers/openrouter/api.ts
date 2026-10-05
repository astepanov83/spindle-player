// What OpenRouter is: its addresses and one request with a time limit.
export const site = 'https://openrouter.ai'
export const api = `${site}/api/v1`

const timeoutMs = 60_000
// free reasoning models are slow: one took 114 s for 82 names
export const askTimeoutMs = 300_000

export interface Reply {
  status: number
  headers: Headers
  text: string
}

// The fetch failed or ran out of time. The text never has a key in it.
export class NetworkError extends Error {
  constructor(
    message: string,
    readonly timedOut = false
  ) {
    super(message)
  }
}

// The caller's `signal` aborting rethrows its reason, so the caller can tell a
// cancel from a network error.
export async function send(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  ms = timeoutMs
): Promise<Reply> {
  const ctl = new AbortController()
  const onAbort = (): void => ctl.abort()
  if (signal.aborted) ctl.abort()
  signal.addEventListener('abort', onAbort, { once: true })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ctl.abort()
  }, ms)
  try {
    const res = await fetchFn(url, { ...init, signal: ctl.signal })
    return { status: res.status, headers: res.headers, text: await res.text() }
  } catch (error) {
    signal.throwIfAborted()
    const why = timedOut ? `no answer in ${ms / 1000} s` : String((error as Error).message ?? error)
    throw new NetworkError(why, timedOut)
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
  }
}
