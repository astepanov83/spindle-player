// On play, asks a station's server which streams it has: reads the PLS files,
// probes each stream, and lists the Icecast mounts. Ported from webmusicmo lib/app.js.
import { mergeStreams, type Station, type Stream } from '../../shared/stations'
import { RefusedAddress } from './checked-fetch'
import { refusedAddress } from './logo-fetch'
import { readCapped } from '../library/cover-http'
import { parsePls } from './pls'

export interface FindOptions {
  // checkedFetch in the app: each redirect is checked, and the answer says
  // where it ended up (net.fetch leaves that empty). A fake in tests.
  fetch?: typeof fetch
  log?: (text: string) => void
  // Spindle/<version>
  userAgent?: string
  // local network addresses too: only for a station that is on one itself
  privateOk?: boolean
}

const textTimeoutMs = 8000
const probeTimeoutMs = 6000
// a playlist or status page bigger than this is not one
const maxText = 1024 * 1024

interface Asker {
  f: typeof fetch
  userAgent: string
  privateOk: boolean
}

// 'audio/mpeg' -> 'mp3', so a probe and a status page name a codec the same way.
export function codecOf(contentType: string): string | undefined {
  const type = contentType.split(';')[0].trim().toLowerCase()
  if (type === 'audio/mpeg' || type === 'audio/mp3') return 'mp3'
  if (type === 'audio/aac' || type === 'audio/aacp') return 'aac'
  if (type === 'audio/ogg' || type === 'application/ogg') return 'ogg'
  const m = /^audio\/(?:x-)?([a-z0-9.+-]+)$/.exec(type)
  return m?.[1]
}

// The address without the time stamp some servers add when they redirect.
function withoutQuery(url: string): string {
  const u = new URL(url)
  u.search = ''
  u.hash = ''
  return u.toString()
}

// The stream's own headers, with each redirect checked and followed (the
// address kept is the last one). Any failure gives the address as it is, with
// nothing known about it; undefined when it is, or leads to, an address
// refused, so a playlist can't point main at the user's network.
async function probe(url: string, a: Asker, log: (t: string) => void): Promise<Stream | undefined> {
  try {
    const refused = refusedAddress(url, a.privateOk)
    if (refused) throw new RefusedAddress(refused)
    const res = await a.f(url, {
      method: 'HEAD',
      headers: { 'user-agent': a.userAgent },
      signal: AbortSignal.timeout(probeTimeoutMs)
    })
    // a Shoutcast v1 server sends its stream even for HEAD
    void res.body?.cancel().catch(() => {})
    const final = withoutQuery(res.ok && res.url ? res.url : url)
    const stream: Stream = { url: final }
    const br = parseInt(res.headers.get('icy-br') ?? '', 10)
    if (br > 0) stream.bitrate = br
    const codec = codecOf(res.headers.get('content-type') ?? '')
    if (codec) stream.codec = codec
    return stream
  } catch (error) {
    log(`Could not probe ${url}: ${String(error)}`)
    return error instanceof RefusedAddress ? undefined : { url }
  }
}

async function getText(url: string, a: Asker): Promise<string> {
  const refused = refusedAddress(url, a.privateOk)
  if (refused) throw new Error(refused)
  const res = await a.f(url, {
    headers: { 'user-agent': a.userAgent },
    signal: AbortSignal.timeout(textTimeoutMs)
  })
  if (!res.ok) {
    await res.body?.cancel().catch(() => {})
    throw new Error(`answered ${res.status}`)
  }
  const bytes = await readCapped(res, maxText)
  if (!bytes) throw new Error('too big')
  return new TextDecoder().decode(bytes)
}

// Icecast's status page: one source, or a list of them.
function mountsOf(json: unknown): Stream[] {
  const stats = (json as { icestats?: { source?: unknown } } | null)?.icestats
  const src = stats?.source
  const list = Array.isArray(src) ? src : src ? [src] : []
  const out: Stream[] = []
  for (const s of list as Record<string, unknown>[]) {
    if (!s || typeof s.listenurl !== 'string') continue
    const stream: Stream = { url: s.listenurl }
    // servers spell the bitrate as "bitrate", "ice-bitrate" or "audio_info=bitrate=192"
    let br = 0
    for (const v of [s.bitrate, s['ice-bitrate']]) {
      const n = Number(v)
      if (!br && v !== '' && Number.isFinite(n) && n > 0) br = n
    }
    if (!br) br = Number(/bitrate=(\d+)/.exec(String(s.audio_info ?? ''))?.[1]) || 0
    if (br) stream.bitrate = br
    const codec = codecOf(String(s.server_type ?? ''))
    if (codec) stream.codec = codec
    out.push(stream)
  }
  return out
}

// The streams to add to the station: new ones, and saved ones with data filled in.
// Give them to mergeStreams. Never throws:
// a failed request is logged and the saved streams stay as they are.
export async function findStreams(
  station: Pick<Station, 'pls' | 'streams'>,
  opts: FindOptions = {}
): Promise<Stream[]> {
  const a: Asker = {
    f: opts.fetch ?? fetch,
    userAgent: opts.userAgent ?? 'Spindle',
    privateOk: opts.privateOk ?? false
  }
  const log = opts.log ?? ((t) => console.warn(t))
  const resolved: Stream[] = []

  // the first entry of each playlist is one stream
  for (const url of station.pls ?? []) {
    try {
      const first = parsePls(await getText(url, a))[0]
      if (!first) throw new Error('no entries')
      const stream = await probe(first.url, a, log)
      if (stream) resolved.push(stream)
    } catch (error) {
      log(`Could not read playlist ${url}: ${String(error)}`)
    }
  }

  // A saved stream with no bitrate or codec is probed too, so the mounts below
  // can be compared with what it really is. Its saved address is kept.
  const learned: Stream[] = []
  for (const saved of station.streams) {
    if (saved.bitrate && saved.codec) continue
    const p = await probe(saved.url, a, log)
    if (p) learned.push({ ...p, url: saved.url })
  }

  // the mounts, on the server the first stream came from
  const origin = resolved[0] ?? station.streams[0]
  const mounts: Stream[] = []
  if (origin) {
    const statusUrl = new URL('/status-json.xsl', origin.url).toString()
    try {
      const from = new URL(origin.url)
      for (const m of mountsOf(JSON.parse(await getText(statusUrl, a)))) {
        const u = new URL(m.url)
        u.protocol = from.protocol
        // setting host alone would keep the mount's own port
        u.hostname = from.hostname
        u.port = from.port
        mounts.push({ ...m, url: u.toString() })
      }
    } catch (error) {
      log(`Could not read ${statusUrl}: ${String(error)}`)
    }
  }

  // The playlist streams and probed data come before the mounts, so they win a tie.
  // mergeStreams keeps a saved stream's object when it has nothing to add, so what
  // is not in the saved list by identity is new or filled in.
  const merged = mergeStreams(station.streams, [...resolved, ...learned, ...mounts])
  return merged.filter((s) => !station.streams.includes(s))
}
