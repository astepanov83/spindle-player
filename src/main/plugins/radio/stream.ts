// spindle://radio/<station id>?stream=<n>: main fetches the station's stream and
// passes the audio to the page, so the page never loads a radio URL itself. The
// CSP stays closed and the visualizer gets sound, since most radio servers send
// no CORS headers (decision 149). The ICY titles are taken out on the way.
import type { LastAnswer } from '../../../shared/plugins/radio/ipc'
import type { Station } from '../../../shared/plugins/radio/stations'
import { IcySplitter, readIcyHead } from './icy'

export interface RadioOptions {
  // a saved station, or one the page just played from search
  lookup: (id: string) => Station | undefined
  // net.fetch in the app: Node's fetch rejects Shoutcast v1's `ICY 200 OK`
  fetch: typeof fetch
  // each new title of the stream
  onTitle: (stationId: string, title: string) => void
  log: (text: string) => void
  // a browser's User-Agent gets Shoutcast v1's HTML page, not the stream
  userAgent: string
  timeoutMs?: number
  streams?: RadioStreams
  // the stream answered with audio (a Radio Browser click counts then)
  opened?: (stationId: string, url: string) => void
}

// The page has one audio element, so one radio stream at a time. Electron
// doesn't tell a handler that the page dropped a request still waiting for its
// server (the request's signal never aborts), so a new request stops the old one.
// Also keeps what main last answered for each station (ticket 027).
export class RadioStreams {
  #last = new Map<string, LastAnswer>()
  #stop: (() => void) | undefined

  lastAnswer(id: string): LastAnswer | undefined {
    const a = this.#last.get(id)
    return a && { ...a }
  }

  begin(stop: () => void): void {
    this.#stop?.()
    this.#stop = stop
  }

  // The page paused the radio: its element keeps the stream, so main ends it.
  stop(): void {
    this.#stop?.()
    this.#stop = undefined
  }

  end(stop: () => void): void {
    if (this.#stop === stop) this.#stop = undefined
  }

  // kept as it is: the stream counts its bytes in it
  answered(id: string, a: LastAnswer): void {
    this.#last.set(id, a)
  }
}

const common = { 'Access-Control-Allow-Origin': '*' }
// a Shoutcast v1 head bigger than this is not one
const maxHead = 16384

function answer(status: number, text: string): Response {
  return new Response(text, { status, headers: common })
}

// No type is let through too: Chromium sniffs it.
function isAudio(type: string | undefined): boolean {
  if (!type) return true
  const t = type.split(';')[0].trim().toLowerCase()
  return t.startsWith('audio/') || t === 'application/ogg' || t === 'application/octet-stream'
}

function join(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

// What the answer's headers said: from the real headers, or for a Shoutcast v1
// server from the head at the start of the body. `first` is audio already read.
interface Opened {
  reader: ReadableStreamDefaultReader<Uint8Array>
  type?: string
  metaint?: number
  first?: Uint8Array
}

async function open(url: string, o: RadioOptions, signal: AbortSignal): Promise<Opened> {
  const res = await o.fetch(url, {
    headers: { 'Icy-MetaData': '1', 'User-Agent': o.userAgent },
    signal
  })
  if (!res.ok) throw new Error(`answered ${res.status}`)
  if (!res.body) throw new Error('answered with no body')
  const reader = res.body.getReader()
  const type = res.headers.get('content-type') ?? undefined
  if (type) {
    if (!isAudio(type)) throw new Error(`answered ${type}, not audio`)
    return { reader, type, metaint: Number(res.headers.get('icy-metaint')) || undefined }
  }
  // no headers: maybe `ICY 200 OK` read as HTTP/0.9 (decision 153)
  let got: Uint8Array = new Uint8Array(0)
  for (;;) {
    const { value, done } = await reader.read()
    if (value) got = join(got, value)
    const head = readIcyHead(got)
    if (head === undefined) return { reader, first: got }
    if (head !== 'more') {
      if (head.status !== 200) throw new Error(`answered ICY ${head.status}`)
      const t = head.headers['content-type']
      if (!isAudio(t)) throw new Error(`answered ${t}, not audio`)
      const metaint = Number(head.headers['icy-metaint']) || undefined
      return { reader, type: t, metaint, first: head.rest }
    }
    if (done) throw new Error('ended inside the ICY head')
    if (got.length > maxHead) throw new Error('sent an ICY head that never ends')
  }
}

export async function radioStream(
  id: string,
  streamParam: string | null,
  o: RadioOptions
): Promise<Response> {
  const station = o.lookup(id)
  const n = /^\d+$/.test(streamParam ?? '') ? Number(streamParam) : -1
  const stream = station?.streams[n]
  if (!station || !stream) {
    o.log(`spindle://radio/${id}?stream=${streamParam}: no such station or stream; answered 404`)
    o.streams?.answered(id, { ok: false, bytes: 0 })
    return answer(404, 'Not found')
  }

  // one controller for the timeout, the page closing the request, and a newer request
  const ac = new AbortController()
  // a newer radio request came: this one ends quietly
  let replaced = false
  // aborting the fetch also stops its body
  const stop = (): void => {
    replaced = true
    ac.abort(new Error('another radio request came'))
  }
  o.streams?.begin(stop)
  // the last connection's answer must not stand for this one while it waits
  o.streams?.answered(id, { ok: false, bytes: 0 })
  const timer = setTimeout(
    () => ac.abort(new Error(`no answer in ${(o.timeoutMs ?? 10000) / 1000}s`)),
    o.timeoutMs ?? 10000
  )
  let opened: Opened
  try {
    opened = await open(stream.url, o, ac.signal)
  } catch (e) {
    // the timeout's reason, not the AbortError it caused
    const why = ac.signal.reason instanceof Error ? ac.signal.reason.message : String(e)
    ac.abort()
    o.streams?.end(stop)
    if (!replaced) o.streams?.answered(id, { ok: false, bytes: 0 })
    o.log(`Radio ${id}: ${stream.url} ${why}; answered 502`)
    return answer(502, 'Bad gateway')
  } finally {
    clearTimeout(timer)
  }

  const { reader } = opened
  const record: LastAnswer = { ok: true, bytes: 0 }
  o.streams?.answered(id, record)
  o.opened?.(id, stream.url)
  const splitter = new IcySplitter(opened.metaint)
  let last: string | undefined
  let sent = 0
  // a read still waiting when the page closes ends as done; that is not the server
  let closed = false
  // gives the audio to the page, and each new title to onTitle
  const pass = (c: ReadableStreamDefaultController<Uint8Array>, chunk: Uint8Array): boolean => {
    const { audio, titles } = splitter.push(chunk)
    for (const t of titles) {
      if (t === last) continue
      last = t
      o.onTitle(id, t)
    }
    if (audio.length === 0) return false
    sent += audio.length
    record.bytes = sent
    c.enqueue(audio)
    return true
  }

  const end = (c: ReadableStreamDefaultController<Uint8Array>): void => {
    void reader.cancel().catch(() => {})
    c.close()
  }

  const body = new ReadableStream<Uint8Array>({
    start(c) {
      if (opened.first?.length) pass(c, opened.first)
    },
    async pull(c) {
      for (;;) {
        let r: ReadableStreamReadResult<Uint8Array>
        try {
          r = await reader.read()
        } catch (e) {
          if (closed) return
          if (replaced) return end(c)
          o.streams?.end(stop)
          // the page gets an error too, and reconnects
          o.log(`Radio ${id}: the stream failed after ${sent} bytes: ${String(e)}`)
          throw e
        }
        const { value, done } = r
        if (closed) return
        if (replaced) return end(c)
        if (done) {
          o.streams?.end(stop)
          // the page counts this as an error and reconnects
          o.log(`Radio ${id}: the server ended the stream after ${sent} bytes`)
          c.close()
          return
        }
        if (pass(c, value)) return
      }
    },
    // stop, another station or another bitrate: stop downloading at once
    cancel() {
      closed = true
      o.streams?.end(stop)
      o.log(`Radio ${id}: closed by the page after ${sent} bytes`)
      ac.abort()
      void reader.cancel().catch(() => {})
    }
  })
  const headers: Record<string, string> = { ...common, 'Cache-Control': 'no-store' }
  if (opened.type) headers['Content-Type'] = opened.type
  return new Response(body, { status: 200, headers })
}
