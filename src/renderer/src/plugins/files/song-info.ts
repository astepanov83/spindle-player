// The song info panel for a song of the library (ticket 127): what the
// library knows at once, and the file as main reads it when the panel opens.
// The core draws the sections (library/SongInfo.svelte).
import { songYear, type Album, type ReplayGain, type Track } from '../../../../shared/library'
import type { Play } from '../../../../shared/plays'
import type { AudioFormat, InfoTag, SongFileInfo } from '../../../../shared/plugins/files/song-info'
import { itemKey } from '../../../../shared/plugins/items'
import { fmtClock } from '../../format'
import { dayText } from '../../library/stats'
import { loved } from '../../stores/loved.svelte'
import { plays } from '../../stores/plays.svelte'
import type { InfoButton, InfoLine, InfoSection, SongInfoView } from '../types'
import { files } from './store.svelte'
import { fieldLabels, songChanges } from './tag-edit'

// --- values ---

// 44100 -> "44.1 kHz", 48000 -> "48 kHz", 500 -> "500 Hz"
export function fmtRate(hz: number): string {
  if (hz < 1000) return `${Math.round(hz)} Hz`
  return `${String(Math.round(hz / 100) / 10)} kHz`
}

// 320000 -> "320 kbps", 1411200 -> "1,411 kbps"
export function fmtBitrate(bps: number): string {
  if (bps < 1000) return `${Math.round(bps)} bps`
  return `${Math.round(bps / 1000).toLocaleString('en-US')} kbps`
}

// In units of 1024, as file managers on Windows and foobar2000 count them,
// with one decimal under 10: 7654321 -> "7.3 MB"
export function fmtBytes(n: number): string {
  if (n < 1024) return n === 1 ? '1 byte' : `${n} bytes`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let u = 0
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024
    u++
  }
  const shown = v < 10 ? Math.round(v * 10) / 10 : Math.round(v)
  return `${shown.toLocaleString('en-US')} ${units[u]}`
}

// "7.3 MB (7,654,321 bytes)"; the exact count only past a KB
export function fmtSize(n: number): string {
  const short = fmtBytes(n)
  return n < 1024 ? short : `${short} (${n.toLocaleString('en-US')} bytes)`
}

// -7.5 -> "-7.50 dB", 2.1 -> "+2.10 dB"
export function fmtGain(db: number): string {
  const v = Math.abs(db) < 0.005 ? 0 : db
  return `${v > 0 ? '+' : v < 0 ? '-' : ''}${Math.abs(v).toFixed(2)} dB`
}

// 0.98765 -> "0.987650"; over 1 the file clips at full volume
export function fmtPeak(peak: number): string {
  return `${peak.toFixed(6)}${peak > 1 ? ' (over full scale)' : ''}`
}

export function fmtChannels(n: number): string {
  if (n === 1) return 'Mono'
  if (n === 2) return 'Stereo'
  if (n === 6) return '5.1 (6 channels)'
  if (n === 8) return '7.1 (8 channels)'
  return `${n} channels`
}

// A place in a disc image: 65.5 -> "1:05.50"
export function fmtPlace(s: number): string {
  const whole = Math.floor(s)
  const cs = Math.round((s - whole) * 100)
  return `${fmtClock(whole + Math.floor(cs / 100))}.${String(cs % 100).padStart(2, '0')}`
}

// "14 October 2026, 13:05"
export function fmtWhen(at: number): string {
  const d = new Date(at)
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${dayText(at)}, ${hm}`
}

// "FLAC, lossless"; "MPEG 1 Layer 3, V0"
export function codecText(f: AudioFormat): string | undefined {
  if (!f.codec) return undefined
  const parts = [f.codec]
  if (f.profile) parts.push(f.profile)
  if (f.lossless === true) parts.push('lossless')
  return parts.join(', ')
}

export function bitrateText(f: AudioFormat, cue: boolean): string | undefined {
  if (!f.bitrate) return undefined
  const v = fmtBitrate(f.bitrate)
  const of = cue ? ' (of the whole image)' : ''
  return f.bitrateFrom === 'size' ? `About ${v}, from the file size${of}` : v + of
}

// A long value is cut on screen, with a way to see it all.
const isLong = (v: string): boolean => v.length > 160 || v.includes('\n')

// "Cover (front) · JPEG · 600 × 600 · 84 KB"
export function pictureText(p: NonNullable<InfoTag['picture']>): string {
  const parts = ['Picture']
  if (p.kind) parts[0] = p.kind
  if (p.format) parts.push(p.format.replace(/^image\//, '').toUpperCase())
  if (p.width && p.height) parts.push(`${p.width} × ${p.height}`)
  parts.push(fmtBytes(p.bytes))
  return parts.join(' · ')
}

// --- the view ---

export interface SongInfoInput {
  t: Track
  album?: Album
  // undefined while it is read; null: main had nothing (the song left the
  // library, Music files went off)
  file?: SongFileInfo | null
  play?: Play
  // when it was loved
  lovedAt?: number
  // the panel's buttons
  show(which: 'file' | 'sheet'): Promise<boolean>
  copy(text: string): Promise<boolean>
}

const row = (label: string, value: string | undefined, more: Partial<InfoLine> = {}): InfoLine[] =>
  value ? [{ label, value, ...more } as InfoLine] : []

export function songInfoView(i: SongInfoInput): SongInfoView {
  return {
    title: i.t.title,
    sub: i.t.artist,
    sections: [song(i), file(i), loudness(i), spindle(i), tags(i)]
  }
}

function song(i: SongInfoInput): InfoSection {
  const { t, album } = i
  const f = i.file ?? undefined
  // a year or genre changed in Spindle (ticket 129) shows as the library has it
  const fixed = t.fileTags ?? {}
  const year =
    fixed.year !== undefined
      ? songYear(t, album) || undefined
      : (f?.year ?? (album?.year || undefined))
  const genre = fixed.genre !== undefined ? t.genre : (t.genre ?? f?.genre)
  return {
    title: 'Song',
    rows: [
      ...row('Title', t.title),
      ...row(
        t.artists && t.artists.length > 1 ? 'Artists' : 'Artist',
        (t.artists ?? [t.artist]).join(', ')
      ),
      ...row('Album', t.album),
      ...row('Album artist', album?.artist),
      ...row('Track', t.no ? String(t.no) : undefined),
      ...row('Disc', t.disc ? String(t.disc) : undefined),
      ...row('Year', year ? String(year) : undefined),
      ...row('Genre', genre?.join(', ')),
      ...row('Length', t.duration ? fmtClock(t.duration) : undefined)
    ]
  }
}

function pathButtons(i: SongInfoInput, which: 'file' | 'sheet', path: string): InfoButton[] {
  return [
    {
      label: 'Show in folder',
      run: async () => ((await i.show(which)) ? undefined : "Couldn't open the folder")
    },
    { label: 'Copy path', run: async () => ((await i.copy(path)) ? 'Copied' : "Couldn't copy") }
  ]
}

function file(i: SongInfoInput): InfoSection {
  const f = i.file
  const s: InfoSection = { title: 'File', rows: [] }
  if (f === undefined) {
    s.note = 'Reading the file…'
    s.rows.push(...row('Format', i.t.codec || undefined))
    if (i.t.rate) s.rows.push(...row('Sample rate', fmtRate(i.t.rate)))
    return s
  }
  if (f === null) {
    s.note = 'Spindle could not find this song’s file.'
    return s
  }
  if (f.error) s.note = f.error
  const fm = f.format ?? {}
  const cue = f.cue
  s.rows.push(
    ...row('Format', fm.container),
    ...row('Codec', codecText(fm)),
    ...row('Encoder', fm.tool),
    ...row('Sample rate', fm.sampleRate ? fmtRate(fm.sampleRate) : undefined),
    ...row('Bit depth', fm.bits ? `${fm.bits} bit` : undefined),
    ...row('Channels', fm.channels ? fmtChannels(fm.channels) : undefined),
    ...row('Bitrate', bitrateText(fm, !!cue)),
    ...row('File size', f.size !== undefined ? fmtSize(f.size) : undefined),
    ...row('Modified', f.modified ? fmtWhen(f.modified) : undefined),
    ...row(cue ? 'Disc image' : 'Path', f.path, {
      path: true,
      buttons: pathButtons(i, 'file', f.path)
    })
  )
  if (cue) {
    s.rows.push(
      ...row('CUE sheet', cue.sheet + (cue.sheetGone ? ' (not found)' : ''), {
        path: true,
        buttons: pathButtons(i, 'sheet', cue.sheet)
      }),
      ...row('Starts at', fmtPlace(cue.start)),
      ...row('Ends at', cue.end !== undefined ? fmtPlace(cue.end) : 'The end of the image')
    )
  }
  if (f.probed) s.rows.push(...row('Read by', 'ffprobe (music-metadata could not read it)'))
  return s
}

function loudness(i: SongInfoInput): InfoSection {
  const g: ReplayGain | undefined = i.file ? i.file.gain : i.t.gain
  const rows = [
    ...row('Track gain', g?.track !== undefined ? fmtGain(g.track) : undefined),
    ...row('Track peak', g?.trackPeak !== undefined ? fmtPeak(g.trackPeak) : undefined),
    ...row('Album gain', g?.album !== undefined ? fmtGain(g.album) : undefined),
    ...row('Album peak', g?.albumPeak !== undefined ? fmtPeak(g.albumPeak) : undefined)
  ]
  return { title: 'Loudness', rows, ...(!rows.length && { note: 'No ReplayGain tags' }) }
}

function spindle(i: SongInfoInput): InfoSection {
  const { t, album, play } = i
  const added = i.file?.added ?? (album?.added || undefined)
  const rows: InfoLine[] = [
    ...row(
      'Plays',
      play?.n ? (play.n === 1 ? 'Once' : `${play.n.toLocaleString('en-US')} times`) : 'Never'
    ),
    ...row('Last played', play?.last ? fmtWhen(play.last) : undefined),
    ...row('Loved', i.lovedAt ? `Yes, since ${dayText(i.lovedAt)}` : 'No'),
    ...row('Added', added ? dayText(added) : undefined),
    ...row('Artist fix', fixText(t.artistTag, t.artist, t.grouped)),
    ...row('Album artist fix', fixText(album?.artistTag, album?.artist, album?.grouped)),
    // Edit song info's changes (ticket 129); the file stays as it is
    ...songChanges(t, album).map((c): InfoLine => ({
      label: `${fieldLabels[c.field]} changed`,
      value: `${c.file || 'none'} → ${c.now || 'none'}`
    }))
  ]
  return { title: 'In Spindle', rows }
}

// What artists.json did to a credit: whose change, and from what.
export function fixText(
  tag: string | undefined,
  shown: string | undefined,
  grouped: true | undefined
): string | undefined {
  if (tag === undefined || shown === undefined || tag === shown) return undefined
  const by = grouped ? 'by Fix artist names (AI)' : 'by your change'
  return `The tag says “${tag}”, shown as “${shown}” ${by}`
}

function tags(i: SongInfoInput): InfoSection {
  const s: InfoSection = { title: 'All tags', rows: [] }
  const f = i.file
  if (f === undefined) return { ...s, note: 'Reading the file…' }
  const list = f?.tags
  if (!list) return { ...s, note: f?.gone ? 'No file to read.' : 'The tags could not be read.' }
  if (!list.length) return { ...s, note: 'No tags in the file.' }
  let type = ''
  for (const t of list) {
    if (t.type !== type) {
      type = t.type
      s.rows.push({ heading: tagTypeName(type) })
    }
    if (t.picture) s.rows.push({ label: t.id, value: pictureText(t.picture) })
    else {
      const value = t.cut ? `${t.value}…` : t.value
      s.rows.push({ label: t.id, value: value || '(empty)', long: isLong(value) })
    }
  }
  const notes: string[] = []
  // the sheet's lines are not tags of a file
  if (f.cue) notes.push('The disc image’s own tags. The track’s come from its CUE sheet.')
  if (f.moreTags) notes.push(`${f.moreTags.toLocaleString('en-US')} more tags are not listed.`)
  if (notes.length) s.note = notes.join(' ')
  return s
}

// music-metadata's names for the kinds of tags, as people know them
export function tagTypeName(type: string): string {
  const names: Record<string, string> = {
    vorbis: 'Vorbis comments',
    iTunes: 'iTunes (MP4)',
    asf: 'Windows Media',
    exif: 'EXIF',
    matroska: 'Matroska',
    ffprobe: 'Read by ffprobe',
    AIFF: 'AIFF',
    'RIFF/INFO': 'RIFF INFO'
  }
  return names[type] ?? type
}

// --- the files plugin's answer ---

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (e) {
    window.playbackApi.log(`Could not copy: ${String(e)}`)
    return false
  }
}

export function filesSongInfo(
  id: string
): { now: SongInfoView; full: Promise<SongInfoView> } | undefined {
  const t = files.find(id)
  if (!t) return undefined
  const key = itemKey('files', id)
  const input = (): SongInfoInput => ({
    t,
    album: files.findAlbum(t.albumId),
    play: plays.of(key),
    lovedAt: loved.has(key) ? loved.all[key] : undefined,
    show: (which) => window.libraryApi.showSongFile(id, which),
    copy
  })
  const full = window.libraryApi.songInfo(id).then(
    (file) => songInfoView({ ...input(), file: file ?? null }),
    () => songInfoView({ ...input(), file: null })
  )
  return { now: songInfoView(input()), full }
}
