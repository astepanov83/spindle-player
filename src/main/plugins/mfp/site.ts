// Music For Programming (ticket 052): reads the episode pages of
// musicforprogramming.net. Ported from ~/a/webmusicfp (lib/scrape.js), with
// one change: the page's data is parsed, never run. webmusicfp runs it in
// node:vm, which is not safe for code from the web.

export interface MfpTrack {
  // '' when the row has no " - "
  artist: string
  title: string
}

export interface MfpEpisode {
  slug: string
  number: number
  // "79: Corticyte"
  title: string
  // "Corticyte"
  artist: string
  // the mp3, always https
  url: string
  bytes: number
  // seconds, 0 when unknown
  duration: number
  // ISO, the site's time is UTC
  date: string | null
  tracks: MfpTrack[]
  // the episode's page on the site
  link: string
}

const entities: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  deg: '°',
  hellip: '…',
  ndash: '–',
  mdash: '—'
}

// Letters of names like "&Oacute;lafur Arnalds": case counts here.
const letters: Record<string, string> = {
  szlig: 'ß',
  aelig: 'æ',
  AElig: 'Æ',
  oelig: 'œ',
  OElig: 'Œ',
  oslash: 'ø',
  Oslash: 'Ø',
  eth: 'ð',
  ETH: 'Ð',
  thorn: 'þ',
  THORN: 'Þ'
}

// The rest are a letter and its mark: &auml; is a with the umlaut.
const marks: Record<string, string> = {
  acute: '\u0301',
  grave: '\u0300',
  circ: '\u0302',
  uml: '\u0308',
  tilde: '\u0303',
  ring: '\u030a',
  cedil: '\u0327',
  caron: '\u030c'
}

function accented(n: string): string | undefined {
  const m = /^([a-z])([a-z]+)$/i.exec(n)
  const mark = m && marks[m[2]]
  if (!mark) return undefined
  const c = (m[1] + mark).normalize('NFC')
  return c.length === 1 ? c : undefined
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => fromCode(parseInt(h, 16), m))
    .replace(/&#(\d+);/g, (m, d) => fromCode(Number(d), m))
    .replace(
      /&([a-z]+);/gi,
      (m, n: string) => letters[n] ?? accented(n) ?? entities[n.toLowerCase()] ?? m
    )
}

function fromCode(n: number, fallback: string): string {
  return n <= 0x10ffff ? String.fromCodePoint(n) : fallback
}

// The hidden list on every page links each episode as <a href=slug>79: Name</a>.
export function parseSlugs(html: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/<a href=([a-z]+)>(\d+): /g))
    if (!out.includes(m[1])) out.push(m[1])
  return out
}

export function parseDuration(text: string): number {
  if (!/^\d+(:\d+){0,2}$/.test(text.trim())) return 0
  return text
    .trim()
    .split(':')
    .reduce((acc, n) => acc * 60 + Number(n), 0)
}

export function parseTracklist(text: string): MfpTrack[] {
  return text
    .split(/<br\s*\/?>/i)
    .map((l) =>
      decodeEntities(l.replace(/<[^>]+>/g, ''))
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf(' - ')
      if (i < 0) return { artist: '', title: line }
      return { artist: line.slice(0, i).trim(), title: line.slice(i + 3).trim() }
    })
}

// --- the page's data object ---

class NotData extends Error {}

// Reads a JS value the way Sapper writes it: objects (bare or quoted keys),
// arrays, strings, numbers, true, false, null and `void 0`. Anything else
// (a function, a name) throws: it would only mean something if run.
class ValueReader {
  i: number
  constructor(
    readonly s: string,
    at: number
  ) {
    this.i = at
  }

  value(): unknown {
    const c = this.s[this.i]
    if (c === '{') return this.object()
    if (c === '[') return this.array()
    if (c === '"' || c === "'") return this.string()
    if (c === '-' || (c >= '0' && c <= '9')) return this.number()
    for (const [word, v] of [
      ['true', true],
      ['false', false],
      ['null', null],
      ['void 0', undefined]
    ] as const)
      if (this.s.startsWith(word, this.i)) {
        this.i += word.length
        return v
      }
    throw new NotData()
  }

  object(): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    this.i++
    if (this.eat('}')) return out
    for (;;) {
      const key = this.key()
      this.expect(':')
      out[key] = this.value()
      if (this.eat('}')) return out
      this.expect(',')
    }
  }

  array(): unknown[] {
    const out: unknown[] = []
    this.i++
    if (this.eat(']')) return out
    for (;;) {
      out.push(this.value())
      if (this.eat(']')) return out
      this.expect(',')
    }
  }

  key(): string {
    const c = this.s[this.i]
    if (c === '"' || c === "'") return this.string()
    const m = /^[A-Za-z_$][\w$]*/.exec(this.s.slice(this.i, this.i + 64))
    if (!m) throw new NotData()
    this.i += m[0].length
    return m[0]
  }

  string(): string {
    const q = this.s[this.i++]
    let out = ''
    for (;;) {
      const c = this.s[this.i++]
      if (c === undefined) throw new NotData()
      if (c === q) return out
      if (c !== '\\') {
        out += c
        continue
      }
      const e = this.s[this.i++]
      if (e === 'u' || e === 'x') {
        const n = e === 'u' ? 4 : 2
        const hex = this.s.slice(this.i, this.i + n)
        if (!new RegExp(`^[0-9a-fA-F]{${n}}$`).test(hex)) throw new NotData()
        out += String.fromCharCode(parseInt(hex, 16))
        this.i += n
      } else if (e === 'n') out += '\n'
      else if (e === 't') out += '\t'
      else if (e === 'r') out += '\r'
      else if (e === 'b') out += '\b'
      else if (e === 'f') out += '\f'
      else if (e === undefined) throw new NotData()
      else out += e
    }
  }

  number(): number {
    const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(this.s.slice(this.i, this.i + 32))
    if (!m) throw new NotData()
    this.i += m[0].length
    return Number(m[0])
  }

  eat(c: string): boolean {
    if (this.s[this.i] !== c) return false
    this.i++
    return true
  }

  expect(c: string): void {
    if (!this.eat(c)) throw new NotData()
  }
}

// The `entry` object of `__SAPPER__={...preloaded:[void 0,{entry:{...}}]}`.
export function readEntry(html: string): Record<string, unknown> | undefined {
  const mark = '__SAPPER__='
  const at = html.indexOf(mark)
  if (at < 0) return undefined
  let data: unknown
  try {
    data = new ValueReader(html, at + mark.length).value()
  } catch (e) {
    if (e instanceof NotData) return undefined
    throw e
  }
  const preloaded = (data as { preloaded?: unknown } | null)?.preloaded
  if (!Array.isArray(preloaded)) return undefined
  for (const p of preloaded) {
    const entry = (p as { entry?: unknown } | undefined)?.entry
    if (typeof entry === 'object' && entry !== null) return entry as Record<string, unknown>
  }
  return undefined
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '')

// "2011-02-22 17:17:58" -> "2011-02-22T17:17:58Z"
function isoDate(ts: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(ts.trim())
  return m ? `${m[1]}T${m[2]}Z` : null
}

export function parseEpisode(html: string, site: string): MfpEpisode | undefined {
  const e = readEntry(html)
  if (!e || e.type !== 'episode') return undefined
  const url = text(e.file)
  const slug = text(e.slug)
  if (!url.startsWith('https://') || !/^[a-z]+$/.test(slug)) return undefined
  const title = decodeEntities(text(e.title))
  return {
    slug,
    number: Number(e.order) || 0,
    title,
    artist: title.replace(/^\d+:\s*/, ''),
    url,
    bytes: Number(e.filesize) || 0,
    duration: parseDuration(text(e.duration)),
    date: isoDate(text(e.timestamp)),
    tracks: parseTracklist(text(e.tracklist)),
    link: `${site}/${slug}`
  }
}
