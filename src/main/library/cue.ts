// CUE sheets: a text file that splits one disc image (or a few files) into
// tracks. Plain functions, so they are tested without files.

export interface CueTrack {
  // TRACK number, 1-based
  no: number
  title?: string
  performer?: string
  // the FILE (index into CueSheet.files) its INDEX 01 is in
  file: number
  // seconds into that file where it starts (INDEX 01, else INDEX 00)
  start: number
}

export interface CueSheet {
  title?: string
  performer?: string
  // REM DATE, REM GENRE, REM DISCNUMBER
  year?: number
  genre?: string
  disc?: number
  // FILE names as written, in order
  files: string[]
  // audio tracks only, in sheet order
  tracks: CueTrack[]
}

// UTF-8 when it is valid UTF-8 (with or without a BOM), UTF-16 with a BOM,
// else the single-byte code page whose text looks most like real words.
export function decodeCue(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return decodeSingleByte(bytes)
  }
}

// Russian rips (cp1251) and Western ones (cp1252) are the non-UTF-8 sheets
// seen in the wild. cp1251 comes first, so it wins a tie, as it was the only
// choice before.
const codePages = ['windows-1251', 'windows-1252']

// cp1252's 0x80-0x9f. Node 22's TextDecoder gives C1 controls there (it
// treats windows-1252 as latin1); Electron's Node gets them right. Holes stay
// controls, as in the WHATWG table.
const cp1252High = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152,
  0x8d, 0x17d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122,
  0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178
]

export function decodePage(bytes: Uint8Array, page: string): string {
  const text = new TextDecoder(page).decode(bytes)
  if (page !== 'windows-1252') return text
  return text.replace(/[\x80-\x9f]/g, (c) =>
    String.fromCharCode(cp1252High[c.charCodeAt(0) - 0x80])
  )
}

export function decodeSingleByte(bytes: Uint8Array): string {
  let best = ''
  let bestScore = -Infinity
  for (const page of codePages) {
    const text = decodePage(bytes, page)
    const score = wordScore(text)
    if (score > bestScore) [best, bestScore] = [text, score]
  }
  return best
}

// Signs a title may well have: typographic punctuation, and every Latin-1
// sign (x2, 2½, ¹, £), since cp1252 sheets use them. Any other non-ASCII sign
// is likely a letter read with the wrong code page.
const fineSigns = new Set(
  '\u2013\u2014\u2018\u2019\u201a\u201c\u201d\u201e\u2020\u2021\u2022\u2026\u2030\u2039\u203a\u20ac\u2122\u00d7\u00f7' +
    Array.from({ length: 0x20 }, (_, i) => String.fromCharCode(0xa0 + i)).join('')
)
const cyrillic = /\p{Script=Cyrillic}/u
// Russian, Ukrainian and Belarusian one-letter words ("я", "в", "і", "ў")
const cyrillicWords = new Set('авиксоуяжбійзўАВИКСОУЯЖБІЙЗЎ')
// The cue command at the start of a line (TITLE, REM GENRE): not part of the value
const command = /^\s*(?:REM\s+[A-Z_]+|[A-Z]+)(?=\s)/

// How much the non-ASCII part of a text looks like real words: +1 for each
// non-ASCII letter in a likely word, -1 for each in an unlikely one and for
// each odd sign. A likely word is all Cyrillic, or Latin with at most one
// more accented letter than plain ones ("Café", "été"). Cyrillic mixed with
// Latin ("Cafй") is what cp1251 makes of a Western name, and a run of
// accented letters ("Äèñêîãðàôèÿ") is what cp1252 makes of a Russian one.
// A one-letter word says little: "à" and "а" are the same byte. A lone
// Cyrillic letter counts only as a real one-letter word in a Cyrillic line;
// among Latin words, or when it is no such word ("Ч" from "×"), it counts
// against. "№" counts only before a number (cp1252's "¹" is the same byte).
export function wordScore(textIn: string): number {
  let score = 0
  for (const raw of textIn.split(/\r\n|\r|\n/)) {
    const line = raw.replace(command, '')
    const words = [...line.matchAll(/\p{L}+/gu)].map((m) => m[0])
    const cyrillicLine = words.some((w) => w.length > 1 && [...w].every((c) => cyrillic.test(c)))
    const latinLine = words.some((w) => /[a-z]/i.test(w))
    for (const m of line.matchAll(/\p{L}+|[^\p{L}\p{ASCII}]/gu)) {
      const w = m[0]
      if (!/\p{L}/u.test(w)) {
        if (w === '\u2116') {
          if (!/^\s?\d/.test(line.slice(m.index + 1))) score--
        } else if (!fineSigns.has(w)) score--
        continue
      }
      if ([...w].length === 1) {
        if (cyrillic.test(w))
          score +=
            cyrillicWords.has(w) && cyrillicLine ? 1 : cyrillicWords.has(w) && !latinLine ? 0 : -1
        continue
      }
      let ascii = 0
      let cyr = 0
      for (const ch of w)
        if (ch <= '\x7f') ascii++
        else if (cyrillic.test(ch)) cyr++
      const other = [...w].length - ascii - cyr
      const nonAscii = cyr + other
      if (nonAscii === 0) continue
      const likely = (cyr > 0 && ascii === 0 && other === 0) || (cyr === 0 && other <= ascii + 1)
      score += likely ? nonAscii : -nonAscii
    }
  }
  return score
}

// "mm:ss:ff", with 75 frames a second. Minutes can go past 99.
export function cueTime(s: string): number | undefined {
  const m = /^(\d+):(\d{1,2}):(\d{1,2})$/.exec(s)
  if (!m) return undefined
  const [mm, ss, ff] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (ss >= 60 || ff >= 75) return undefined
  return mm * 60 + ss + ff / 75
}

// The value of a TITLE or PERFORMER line: quotes around it are dropped.
// Some sheets have no quotes, or quotes inside the value.
function text(rest: string): string | undefined {
  let t = rest.trim()
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1)
  else if (t.startsWith('"')) t = t.slice(1)
  t = t.replace(/\s+/g, ' ').trim()
  return t || undefined
}

// FILE "name with spaces.ape" WAVE, or FILE name.ape WAVE
function fileName(rest: string): string | undefined {
  const r = rest.trim()
  const quoted = /^"(.*)"(?:\s+\S+)?$/.exec(r)
  if (quoted) return quoted[1].trim() || undefined
  const bare = /^(.+?)(?:\s+(?:WAVE|MP3|AIFF|BINARY|MOTOROLA|FLAC))?$/i.exec(r)
  return bare?.[1].trim() || undefined
}

// Undefined when the text has no audio tracks.
export function parseCue(textIn: string): CueSheet | undefined {
  const sheet: CueSheet = { files: [], tracks: [] }
  // the audio track being read; undefined in a data track
  let track: (CueTrack & { index0?: { file: number; at: number }; has1: boolean }) | undefined
  // lines after the first TRACK belong to tracks, not to the album
  let seenTrack = false
  const tracks: NonNullable<typeof track>[] = []

  for (const raw of textIn.split(/\r\n|\r|\n/)) {
    const line = raw.trim()
    const m = /^(\S+)\s*(.*)$/.exec(line)
    if (!m) continue
    const cmd = m[1].toUpperCase()
    const rest = m[2]
    switch (cmd) {
      case 'FILE': {
        const name = fileName(rest)
        if (name) sheet.files.push(name)
        break
      }
      case 'TRACK': {
        const t = /^(\d+)\s+(\S+)/.exec(rest)
        track = undefined
        seenTrack = true
        if (!t || t[2].toUpperCase() !== 'AUDIO' || !sheet.files.length) break
        track = { no: Number(t[1]), file: sheet.files.length - 1, start: 0, has1: false }
        tracks.push(track)
        break
      }
      case 'TITLE':
      case 'PERFORMER': {
        const v = text(rest)
        const key = cmd === 'TITLE' ? 'title' : 'performer'
        if (track) track[key] = v
        // a TITLE under a data track is not the album's
        else if (!seenTrack) sheet[key] = v
        break
      }
      case 'INDEX': {
        const i = /^(\d+)\s+(\S+)/.exec(rest)
        if (!track || !i) break
        const at = cueTime(i[2])
        if (at === undefined) break
        const n = Number(i[1])
        const file = sheet.files.length - 1
        if (n === 1) {
          track.start = at
          track.file = file
          track.has1 = true
        } else if (n === 0) track.index0 = { file, at }
        break
      }
      case 'REM': {
        const r = /^(\S+)\s*(.*)$/.exec(rest)
        if (!r || seenTrack) break
        const key = r[1].toUpperCase()
        const v = text(r[2])
        if (!v) break
        if (key === 'GENRE') sheet.genre = v
        else if (key === 'DATE') {
          const y = Number(/^(\d{4})/.exec(v)?.[1])
          if (y >= 1000 && y <= 9999) sheet.year = y
        } else if (key === 'DISCNUMBER') {
          const d = Number(/^(\d+)/.exec(v)?.[1])
          if (d >= 1) sheet.disc = d
        }
        break
      }
    }
  }

  for (const t of tracks) {
    // no INDEX 01: start at INDEX 00; neither: the track is left out
    if (!t.has1) {
      if (!t.index0) continue
      t.start = t.index0.at
      t.file = t.index0.file
    }
    const out: CueTrack = { no: t.no, file: t.file, start: t.start }
    if (t.title) out.title = t.title
    if (t.performer) out.performer = t.performer
    sheet.tracks.push(out)
  }
  if (!sheet.tracks.length) return undefined
  // drop missing fields, so the index file stays small
  for (const k of ['title', 'performer', 'year', 'genre', 'disc'] as const)
    if (sheet[k] === undefined) delete sheet[k]
  return sheet
}
