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

// UTF-8 when it is valid UTF-8 (with or without a BOM), else Windows-1251,
// which is what most non-UTF-8 sheets from Russian rips are.
export function decodeCue(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1251').decode(bytes)
  }
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
