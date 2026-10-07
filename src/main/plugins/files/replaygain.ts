// ReplayGain tags (ticket 090): from what a tag reader gives, from a CUE
// sheet, and from the index file. Plain functions, tested without files.
import type { ReplayGain } from '../../../shared/library'

// Tag names as gainTagsOf keeps them: lower case, no spaces or underscores.
const names = [
  'replaygaintrackgain',
  'replaygaintrackpeak',
  'replaygainalbumgain',
  'replaygainalbumpeak',
  // Opus files: Q7.8 dB against -23 LUFS (RFC 7845)
  'r128trackgain',
  'r128albumgain'
] as const

export type GainTags = Partial<Record<(typeof names)[number], string>>

// "TXXX:REPLAYGAIN_TRACK_GAIN", "----:com.apple.iTunes:replaygain_track_gain"
// and ffprobe's "replaygain_track_gain" all give "replaygaintrackgain".
export function gainName(id: string): string {
  return id
    .slice(id.lastIndexOf(':') + 1)
    .toLowerCase()
    .replace(/[\s_]/g, '')
}

// The ReplayGain tags among a file's tags, as written; the first of each wins.
// Undefined when there are none.
export function gainTagsOf(tags: Iterable<[string, unknown]>): GainTags | undefined {
  const out: GainTags = {}
  let any = false
  for (const [id, v] of tags) {
    const name = gainName(id) as keyof GainTags
    if (typeof v !== 'string' || !names.includes(name) || out[name] !== undefined) continue
    out[name] = v
    any = true
  }
  return any ? out : undefined
}

// No real file needs more; a bigger number is a broken tag.
const maxDb = 60
const maxPeak = 100

const round = (n: number, places: number): number => Number(n.toFixed(places))

// "-7.54 dB", "+3.2 dB", "-7.54"; some taggers write a comma.
export function parseGainDb(s: string): number | undefined {
  const m = /^\s*([+-]?\d+(?:[.,]\d+)?)\s*(?:db)?\s*$/i.exec(s)
  const n = m ? Number(m[1].replace(',', '.')) : NaN
  return Number.isFinite(n) && Math.abs(n) <= maxDb ? round(n, 2) : undefined
}

// "0.988831"; 0 means the tagger wrote no peak.
export function parsePeak(s: string): number | undefined {
  const n = Number(s.trim().replace(',', '.'))
  return s.trim() && Number.isFinite(n) && n > 0 && n <= maxPeak ? round(n, 6) : undefined
}

// An R128 gain is a whole number of 1/256 dB toward -23 LUFS. ReplayGain
// aims 5 dB louder (about -18 LUFS), so the same song gets 5 dB more.
function parseR128(s: string): number | undefined {
  if (!/^\s*[+-]?\d+\s*$/.test(s)) return undefined
  const db = Number(s) / 256 + 5
  return Math.abs(db) <= maxDb ? round(db, 2) : undefined
}

// Drops what is missing; undefined when nothing is left.
function some(g: ReplayGain): ReplayGain | undefined {
  for (const k of Object.keys(g) as (keyof ReplayGain)[]) if (g[k] === undefined) delete g[k]
  return Object.keys(g).length ? g : undefined
}

// A file's gains from its tags. ReplayGain tags win over R128 ones.
export function replayGainOf(t: GainTags | undefined): ReplayGain | undefined {
  if (!t) return undefined
  const db = (rg: string | undefined, r128: string | undefined): number | undefined =>
    (rg === undefined ? undefined : parseGainDb(rg)) ??
    (r128 === undefined ? undefined : parseR128(r128))
  const peak = (v: string | undefined): number | undefined =>
    v === undefined ? undefined : parsePeak(v)
  return some({
    track: db(t.replaygaintrackgain, t.r128trackgain),
    trackPeak: peak(t.replaygaintrackpeak),
    album: db(t.replaygainalbumgain, t.r128albumgain),
    albumPeak: peak(t.replaygainalbumpeak)
  })
}

// A REM line of a CUE sheet: "REPLAYGAIN_ALBUM_GAIN" and "-7.20 dB". Album
// lines count before the first TRACK, track lines under a track. Returns the
// field the line sets, or undefined for any other REM.
export function cueGainLine(
  key: string,
  value: string,
  inTrack: boolean
): { field: keyof ReplayGain; value: number } | undefined {
  const k = key.toUpperCase()
  const field = (
    inTrack
      ? { REPLAYGAIN_TRACK_GAIN: 'track', REPLAYGAIN_TRACK_PEAK: 'trackPeak' }
      : { REPLAYGAIN_ALBUM_GAIN: 'album', REPLAYGAIN_ALBUM_PEAK: 'albumPeak' }
  )[k] as keyof ReplayGain | undefined
  if (!field) return undefined
  const v = field.endsWith('Peak') ? parsePeak(value) : parseGainDb(value)
  return v === undefined ? undefined : { field, value: v }
}

const okDb = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= maxDb
const okPeak = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= maxPeak

// Gains as the index file has them; a bad field is dropped on its own.
export function parseReplayGain(v: unknown): ReplayGain | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined
  const r = v as Record<string, unknown>
  return some({
    track: okDb(r.track) ? r.track : undefined,
    trackPeak: okPeak(r.trackPeak) ? r.trackPeak : undefined,
    album: okDb(r.album) ? r.album : undefined,
    albumPeak: okPeak(r.albumPeak) ? r.albumPeak : undefined
  })
}

// A cue track's gains. The sheet's own lines come first. Then the image's
// tags: a file that is the whole track gives its track gain; an image of a
// whole disc was measured as one, so its track gain is the album's.
export function cueTrackGain(
  sheet: ReplayGain | undefined,
  track: ReplayGain | undefined,
  image: ReplayGain | undefined,
  whole: boolean
): ReplayGain | undefined {
  return some({
    track: track?.track ?? (whole ? image?.track : undefined),
    trackPeak: track?.trackPeak ?? (whole ? image?.trackPeak : undefined),
    album: sheet?.album ?? image?.album ?? (whole ? undefined : image?.track),
    albumPeak: sheet?.albumPeak ?? image?.albumPeak ?? (whole ? undefined : image?.trackPeak)
  })
}
