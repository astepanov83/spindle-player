// On play, asks a station's server which streams it has: reads the PLS files,
// probes each stream, and lists the Icecast mounts. Ported from webmusicmo lib/app.js.
import { mergeStreams, type Station, type Stream } from '../../shared/stations'
import { parsePls } from './pls'

export interface FindOptions {
  // net.fetch in the app (it also reads Shoutcast v1 answers); a fake in tests
  fetch?: typeof fetch
  log?: (text: string) => void
}

const userAgent = 'Spindle'
const textTimeoutMs = 8000
const probeTimeoutMs = 6000

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

// The stream's own headers, followed through redirects. Any failure gives the
// address as it is, with nothing known about it.
async function probe(url: string, f: typeof fetch, log: (t: string) => void): Promise<Stream> {
  try {
    const res = await f(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'user-agent': userAgent },
      signal: AbortSignal.timeout(probeTimeoutMs)
    })
    const final = withoutQuery(res.ok && res.url ? res.url : url)
    const stream: Stream = { url: final }
    const br = parseInt(res.headers.get('icy-br') ?? '', 10)
    if (br > 0) stream.bitrate = br
    const codec = codecOf(res.headers.get('content-type') ?? '')
    if (codec) stream.codec = codec
    return stream
  } catch (error) {
    log(`Could not probe ${url}: ${String(error)}`)
    return { url }
  }
}

async function getText(url: string, f: typeof fetch): Promise<string> {
  const res = await f(url, {
    headers: { 'user-agent': userAgent },
    signal: AbortSignal.timeout(textTimeoutMs)
  })
  if (!res.ok) throw new Error(`answered ${res.status}`)
  return res.text()
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

// The streams the server has that the station does not list yet. Never throws:
// a failed request is logged and the saved streams stay as they are.
export async function findStreams(
  station: Pick<Station, 'pls' | 'streams'>,
  opts: FindOptions = {}
): Promise<Stream[]> {
  const f = opts.fetch ?? fetch
  const log = opts.log ?? ((t) => console.warn(t))
  const resolved: Stream[] = []

  // the first entry of each playlist is one stream
  for (const url of station.pls ?? []) {
    try {
      const first = parsePls(await getText(url, f))[0]
      if (!first) throw new Error('no entries')
      resolved.push(await probe(first.url, f, log))
    } catch (error) {
      log(`Could not read playlist ${url}: ${String(error)}`)
    }
  }

  // the mounts, on the server the first stream came from
  const origin = resolved[0] ?? station.streams[0]
  const mounts: Stream[] = []
  if (origin) {
    const statusUrl = new URL('/status-json.xsl', origin.url).toString()
    try {
      const from = new URL(origin.url)
      for (const m of mountsOf(JSON.parse(await getText(statusUrl, f)))) {
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

  // Merged against what is saved, so this only gives streams not listed yet.
  // The playlist streams come first and win a tie with a mount.
  const all = mergeStreams(station.streams, [...resolved, ...mounts])
  const known = new Set(station.streams.map((s) => s.url))
  const kept = new Set(mergeStreams([], [...resolved, ...mounts]).map((s) => s.url))
  return all.filter((s) => !known.has(s.url) && kept.has(s.url))
}
