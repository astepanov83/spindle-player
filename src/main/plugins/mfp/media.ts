// spindle://mfp for an episode's mp3 (tickets 052, 061): main fetches it and
// passes the page's Range on, so seeking works and the page never loads an
// outside URL (the CSP stays closed, as for radio, decision 149).

export interface OnlineMediaOptions {
  // net.fetch in the app
  fetch: typeof fetch
  userAgent: string
  // for the host's headers; the body then runs as long as the page reads it
  timeoutMs?: number
  log: (text: string) => void
}

const common = { 'Access-Control-Allow-Origin': '*' }

// The page tells a 404 ("gone or can't be read") from a format it can't play (decision 105).
const notFound = (): Response => new Response('Not found', { status: 404, headers: common })

function audioType(type: string | null): string {
  const t = type?.split(';')[0].trim().toLowerCase()
  return t?.startsWith('audio/') ? type! : 'audio/mpeg'
}

export async function onlineMedia(
  url: string,
  req: Request,
  decode: boolean,
  o: OnlineMediaOptions
): Promise<Response> {
  // an mp3 always plays in Chromium; the page asks this only after a decode error
  if (decode) return new Response('Unsupported format', { status: 415, headers: common })
  const head = req.method === 'HEAD'
  const headers: Record<string, string> = { 'User-Agent': o.userAgent }
  const range = req.headers.get('Range')
  if (range) headers.Range = range
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), o.timeoutMs ?? 15000)
  let res: Response
  try {
    res = await o.fetch(url, { method: head ? 'HEAD' : 'GET', headers, signal: ac.signal })
  } catch (e) {
    o.log(`${url}: ${ac.signal.aborted ? 'no answer in time' : String(e)}; answered 404`)
    return notFound()
  } finally {
    clearTimeout(timer)
  }
  if (![200, 206, 416].includes(res.status)) {
    o.log(`${url}: answered ${res.status}; answered 404`)
    void res.body?.cancel().catch(() => {})
    return notFound()
  }
  const out: Record<string, string> = {
    ...common,
    'Content-Type': audioType(res.headers.get('Content-Type')),
    'Accept-Ranges': 'bytes'
  }
  for (const h of ['Content-Length', 'Content-Range']) {
    const v = res.headers.get(h)
    if (v) out[h] = v
  }
  if (head || res.status === 416 || !res.body) {
    void res.body?.cancel().catch(() => {})
    return new Response(null, { status: res.status, headers: out })
  }
  const reader = res.body.getReader()
  const body = new ReadableStream<Uint8Array>({
    async pull(c) {
      const { value, done } = await reader.read()
      if (done) c.close()
      else c.enqueue(value)
    },
    // a seek or another song: stop downloading the rest of the file
    cancel() {
      ac.abort()
      void reader.cancel().catch(() => {})
    }
  })
  return new Response(body, { status: res.status, headers: out })
}
