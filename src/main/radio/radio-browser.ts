// Radio Browser (radio-browser.info) search, from webmusicmo's lib/radiobrowser.js.
// Search is by name and by tag at once; the records, one per stream, are
// grouped into stations (decision 144). Mirrors come from DNS and one is kept
// for the run. A play of a station from here counts a click, as their docs ask.
import type { RadioSearch } from '../../shared/ipc'
import { webAddress, type Station, type Stream } from '../../shared/stations'

// The fields read from a station record.
export interface RbRecord {
  stationuuid: string
  name: string
  url: string
  url_resolved: string
  homepage: string
  favicon: string
  tags: string
  countrycode: string
  codec: string
  bitrate: number
  hls: number
  lastcheckok: number
  votes: number
}

const webUrl = (v: unknown): string => (typeof v === 'string' && webAddress(v) ? v.trim() : '')
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export function searchPath(field: 'name' | 'tag', q: string): string {
  const p = new URLSearchParams({
    [field]: q,
    hidebroken: 'true',
    order: 'votes',
    reverse: 'true',
    limit: '100'
  })
  return `/json/stations/search?${p}`
}

// The player needs a plain stream that answered on the last check. HLS is not
// played (as in webmusicmo). No minimum bitrate: search shows what there is.
export function usableRecords(json: unknown): RbRecord[] {
  const out: RbRecord[] = []
  for (const raw of Array.isArray(json) ? json : []) {
    if (typeof raw !== 'object' || raw === null) continue
    const r = raw as Record<string, unknown>
    const uuid = str(r.stationuuid)
    const name = str(r.name).trim()
    if (!/^[A-Za-z0-9-]{1,100}$/.test(uuid) || !name) continue
    if (Number(r.lastcheckok) !== 1 || Number(r.hls) === 1) continue
    const stream = webUrl(r.url_resolved) || webUrl(r.url)
    if (!stream) continue
    out.push({
      stationuuid: uuid,
      name,
      url: str(r.url),
      url_resolved: stream,
      homepage: webUrl(r.homepage),
      favicon: webUrl(r.favicon),
      tags: str(r.tags),
      countrycode: str(r.countrycode),
      codec: str(r.codec),
      bitrate: Number(r.bitrate) || 0,
      hls: 0,
      lastcheckok: 1,
      votes: Number(r.votes) || 0
    })
  }
  return out
}

// Name matches first, then tag matches not seen already. Each list comes best voted first.
export function mergeResults(byName: RbRecord[], byTag: RbRecord[]): RbRecord[] {
  const seen = new Set(byName.map((r) => r.stationuuid))
  return [...byName, ...byTag.filter((r) => !seen.has(r.stationuuid))]
}

// Words that name a stream, not a station: "128k", "320 kbps", "hq", "mp3", "(aac)".
const streamWords =
  /(?<![\p{L}\p{N}])(\d{2,3}\s*(k|kb|kbps|kbit|kbit\/s|kb\/s)|kbps|hq|lq|mp3|aac\+?|he-aac|aacplus|ogg|vorbis|opus|flac)(?![\p{L}\p{N}])/giu

// The name two records of one station share.
export function nameKey(name: string): string {
  const plain = (s: string): string =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  return plain(name.replace(streamWords, ' ')) || plain(name)
}

// The name shown: brackets that only name the stream ("(128k MP3)") go, since
// a grouped station has several streams and the row lists their bitrates.
export function stationName(name: string): string {
  const out = name
    .replace(/\s*[([]([^()[\]]*)[)\]]/g, (whole, inner: string) =>
      inner.replace(streamWords, '').replace(/[^\p{L}\p{N}]+/gu, '') ? whole : ''
    )
    .trim()
  return out || name.trim()
}

function host(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

// Same station: same name without stream words, and same homepage host (the
// stream host when there is no homepage).
const groupKey = (r: RbRecord): string =>
  `${nameKey(r.name)}|${host(r.homepage) || host(r.url_resolved)}`

function codecOf(codec: string): string | undefined {
  const c = codec.trim().toLowerCase()
  if (!c || c === 'unknown') return undefined
  // AAC+ is HE-AAC: the same codec to the player and to mergeStreams
  return c === 'aac+' ? 'aac' : c
}

function streamOf(r: RbRecord): Stream {
  const s: Stream = { url: r.url_resolved }
  if (r.bitrate > 0) s.bitrate = Math.round(r.bitrate)
  const codec = codecOf(r.codec)
  if (codec) s.codec = codec
  return s
}

// One station per group, where its first (best voted) record was. The station
// takes that record's name, homepage, tags and country. Its id must not change
// from one search to the next (votes change, a record fails a check), or a
// saved station would come back as another: the id main knows already (saved
// or played), else the smallest uuid of the group.
export function groupStations(
  records: RbRecord[],
  known: (id: string) => boolean = () => false
): Station[] {
  const groups = new Map<string, RbRecord[]>()
  for (const r of records) {
    const k = groupKey(r)
    const g = groups.get(k)
    if (g) g.push(r)
    else groups.set(k, [r])
  }
  return [...groups.values()].map((g) => {
    const first = g[0]
    const streams: Stream[] = []
    for (const r of g) if (!streams.some((s) => s.url === r.url_resolved)) streams.push(streamOf(r))
    const tags = [
      ...new Set(
        first.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      )
    ].slice(0, 20)
    const ids = g.map((r) => `rb-${r.stationuuid}`)
    const id = ids.find(known) ?? ids.reduce((a, b) => (b < a ? b : a))
    const s: Station = { id, name: stationName(first.name), tags, streams }
    const site = webUrl(first.homepage)
    if (site) s.site = site
    if (first.countrycode.trim()) s.country = first.countrycode.trim().toUpperCase()
    const logo = g.map((r) => webUrl(r.favicon)).find(Boolean)
    if (logo) s.logoUrl = logo
    return s
  })
}

// What resolveMirrors needs of node's dns.promises.
export interface MirrorDns {
  lookup(host: string, o: { all: true }): Promise<{ address: string; family: number }[]>
  reverse(ip: string): Promise<string[]>
}

const roundRobin = 'all.api.radio-browser.info'

// Radio Browser's servers: every address of all.api.radio-browser.info, named
// by a reverse lookup (https needs the name). Shuffled, so users spread over them.
// Only Radio Browser's own names count: a local DNS that proxies it gives its
// own address, whose name ("proxy.lan") is no mirror. The round-robin name, which
// works over https too, is always tried last.
export async function resolveMirrors(
  dns: MirrorDns,
  random: () => number = Math.random
): Promise<string[]> {
  const addrs = await dns.lookup(roundRobin, { all: true })
  const names = await Promise.all(addrs.map((a) => dns.reverse(a.address).catch(() => [])))
  const out = [...new Set(names.flat().map((n) => n.toLowerCase()))].filter(
    (n) => n.endsWith('.api.radio-browser.info') && n !== roundRobin
  )
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return [...out, roundRobin]
}

export interface RadioBrowserDeps {
  fetch: typeof fetch
  // the mirrors' host names, in the order to try them
  mirrors(): Promise<string[]>
  userAgent: string
  log(text: string): void
  timeoutMs?: number
  // a station main knows (saved or played): a group keeps that id
  known?: (id: string) => boolean
}

const timeoutMs = 10000
// Addresses kept to count clicks and fetch row logos. A search adds up to 200.
const maxKnown = 5000

export class RadioBrowser {
  #mirrors: Promise<string[]> | undefined
  // the mirror kept for the run: an index into the list
  #at = 0
  // stream address -> the uuid of its record, from searches this run
  #uuidOf = new Map<string, string>()
  // stations played whose click is not counted yet
  #pending = new Set<string>()
  // records counted this run
  #clicked = new Set<string>()

  constructor(readonly d: RadioBrowserDeps) {}

  // Grouped stations, best voted first, name matches first. { ok: false } when
  // no mirror answered either request.
  async search(q: string): Promise<RadioSearch> {
    const query = q.trim().slice(0, 200)
    if (!query) return { ok: true, stations: [] }
    const [byName, byTag] = await Promise.all([
      this.#get(searchPath('name', query)).catch(() => undefined),
      this.#get(searchPath('tag', query)).catch(() => undefined)
    ])
    if (byName === undefined && byTag === undefined) return { ok: false }
    const records = mergeResults(usableRecords(byName), usableRecords(byTag))
    if (this.#uuidOf.size > maxKnown) this.#uuidOf.clear()
    for (const r of records) this.#uuidOf.set(r.url_resolved, r.stationuuid)
    return { ok: true, stations: groupStations(records, this.d.known) }
  }

  // radio:play for a station: its click is counted when a stream opens.
  played(id: string): void {
    if (id.startsWith('rb-')) this.#pending.add(id)
  }

  // A stream of the station opened. The first after a play counts the record
  // of that stream (a grouped station has several), else the station's own.
  // Radio Browser counts one click a day per station and address, so a record
  // is counted once a run.
  async opened(id: string, url: string | undefined): Promise<void> {
    if (!this.#pending.delete(id)) return
    const uuid = (url && this.#uuidOf.get(url)) || id.slice(3)
    if (this.#clicked.has(uuid)) return
    this.#clicked.add(uuid)
    try {
      await this.#get(`/json/url/${encodeURIComponent(uuid)}`)
    } catch (e) {
      this.d.log(`Radio Browser: could not count a click for ${uuid}: ${String(e)}`)
    }
  }

  // The JSON at `path` on the kept mirror, or on the next ones in turn. Every
  // mirror failed: the list is looked up again next time (the network may be back).
  async #get(path: string): Promise<unknown> {
    const list = await this.#list()
    let last: unknown = new Error('no mirror found')
    for (let n = 0; n < list.length; n++) {
      const at = (this.#at + n) % list.length
      try {
        const res = await this.d.fetch(`https://${list[at]}${path}`, {
          headers: { 'User-Agent': this.d.userAgent },
          signal: AbortSignal.timeout(this.d.timeoutMs ?? timeoutMs)
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        this.#at = at
        return json
      } catch (e) {
        last = e
        this.d.log(`Radio Browser: ${list[at]} failed: ${String(e)}`)
      }
    }
    this.#mirrors = undefined
    throw last
  }

  #list(): Promise<string[]> {
    this.#mirrors ??= this.d.mirrors().catch((e) => {
      this.d.log(`Radio Browser: no mirrors: ${String(e)}`)
      return []
    })
    const job = this.#mirrors
    // an empty list is not kept
    void job.then((l) => {
      if (!l.length && this.#mirrors === job) this.#mirrors = undefined
    })
    return job
  }
}
