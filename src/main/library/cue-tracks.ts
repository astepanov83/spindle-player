// Turns CUE sheets in the index into library tracks: one per cue TRACK, each
// a stretch of a disc image. The image itself is then not listed as a song.
import { basename, join } from 'path'
import type { TrackPart } from '../../shared/library'
import type { CueSheet } from './cue'
import { dirOf, isUnder } from './merge'
import { cueTrackId, shortHash } from './ids'
import type { FileEntry, LibraryIndex } from './types'

// One cue track, ready for grouping: `entry` looks like a file with the
// track's tags, and its path is the image's, so it groups with its folder.
export interface CueItem {
  id: string
  entry: FileEntry
  // undefined when the track is the whole file
  part?: TrackPart
}

const lower = (s: string): string => s.toLocaleLowerCase()
const stem = (name: string): string => {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name
}

// The audio file a cue's FILE line means. Sheets often name a file that isn't
// there: a .wav that was packed to .flac or .ape later, or a renamed image.
// - the name as written, if it is in the sheet's folder or below it (a
//   "../Other/x.flac" must not take a song from another album)
// - the same name in another case
// - the same name with any audio extension, if only one file has it
// - one FILE in the sheet: the file named like the sheet ("X.cue" or
//   "X.ape.cue" for "X.ape"), else the only audio file in the folder
export function resolveCueFile(
  cuePath: string,
  name: string,
  inDir: string[],
  exists: (path: string) => boolean,
  single: boolean
): string | undefined {
  const dir = dirOf(cuePath)
  const wanted = join(dir, name.replace(/\\/g, '/'))
  if (wanted !== dir && isUnder(wanted, dir) && exists(wanted)) return wanted
  const only = (list: string[]): string | undefined => (list.length === 1 ? list[0] : undefined)
  const base = lower(basename(wanted))
  const found =
    only(inDir.filter((p) => lower(basename(p)) === base)) ??
    only(inDir.filter((p) => lower(stem(basename(p))) === lower(stem(base))))
  if (found || !single) return found
  const cueStem = lower(stem(basename(cuePath)))
  return (
    only(
      inDir.filter((p) => {
        const b = lower(basename(p))
        return b === cueStem || stem(b) === cueStem
      })
    ) ?? only(inDir)
  )
}

// The tracks of one image, in time order. The end of each is the start of the
// next one in the same file; the last runs to the end of the file.
function imageTracks(
  sheet: CueSheet,
  fileIndex: number,
  image: FileEntry,
  used: Set<string>
): CueItem[] {
  const tracks = sheet.tracks
    .filter((t) => t.file === fileIndex)
    .sort((a, b) => a.start - b.start || a.no - b.no)
  // a sheet whose tracks start past the end of the file is not for this file
  const last = tracks[tracks.length - 1]
  if (!last || (image.duration > 0 && last.start >= image.duration)) return []
  // one track in a file is that whole file (a sheet over split files), also
  // when its INDEX 01 comes after a pregap: it plays from 0, like the file
  const whole = tracks.length === 1
  const out: CueItem[] = []
  tracks.forEach((t, i) => {
    const id = whole ? shortHash(image.path) : cueTrackId(image.path, t.no)
    if (used.has(id)) return
    used.add(id)
    const end = tracks[i + 1]?.start
    const length = whole ? image.duration : (end ?? image.duration) - t.start
    const entry: FileEntry = {
      path: image.path,
      mtime: image.mtime,
      size: image.size,
      title:
        t.title ?? (whole ? image.title : undefined) ?? `Track ${String(t.no).padStart(2, '0')}`,
      artist: t.performer ?? sheet.performer ?? image.artist,
      albumArtist: sheet.performer ?? image.albumArtist,
      album: sheet.title ?? image.album,
      track: t.no,
      disc: sheet.disc ?? image.disc,
      year: sheet.year ?? image.year,
      genre: sheet.genre ?? image.genre,
      duration: length > 0 ? Math.round(length * 100) / 100 : 0,
      codec: image.codec,
      container: image.container,
      cover: image.cover
    }
    for (const k of Object.keys(entry) as (keyof FileEntry)[])
      if (entry[k] === undefined) delete entry[k]
    const item: CueItem = { id, entry }
    if (!whole) {
      item.part = { file: shortHash(image.path), start: t.start }
      if (end !== undefined) item.part.end = end
    }
    out.push(item)
  })
  return out
}

// Every cue track in the index, and the images they cover. When two sheets
// name the same image, the first by path wins.
export function cueTracks(ix: LibraryIndex): { items: CueItem[]; images: Set<string> } {
  const items: CueItem[] = []
  const images = new Set<string>()
  if (!ix.cues.size) return { items, images }
  const byDir = new Map<string, string[]>()
  for (const p of ix.files.keys()) {
    const d = dirOf(p)
    let list = byDir.get(d)
    if (!list) byDir.set(d, (list = []))
    list.push(p)
  }
  const used = new Set<string>()
  const cues = [...ix.cues.values()].sort((a, b) => (a.path < b.path ? -1 : 1))
  for (const cue of cues) {
    const sheet = cue.sheet
    if (!sheet) continue
    const inDir = byDir.get(dirOf(cue.path)) ?? []
    const taken = new Set<string>()
    sheet.files.forEach((name, i) => {
      const path = resolveCueFile(
        cue.path,
        name,
        inDir.filter((p) => !taken.has(p)),
        (p) => ix.files.has(p) && !taken.has(p),
        sheet.files.length === 1
      )
      if (!path || images.has(path)) return
      taken.add(path)
      const got = imageTracks(sheet, i, ix.files.get(path)!, used)
      if (!got.length) return
      images.add(path)
      items.push(...got)
    })
  }
  return { items, images }
}
