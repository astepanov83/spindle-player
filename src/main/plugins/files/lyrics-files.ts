// A song's words from its own files (ticket 120): an .lrc file next to it,
// else its tags. Read once when the song starts, never by the scan, so the
// index stays as it is (decision 229).
import { open } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { TimestampFormat, type ILyricsTag } from 'music-metadata'
import { maxLrcBytes, parseLyricsText, type Lyrics } from '../../../shared/lyrics'
import { decodeCue } from './cue'
import { readTags } from './read-tags'

// The file to read the words of. A CUE track is a stretch of a disc image:
// its words can only come from an .lrc named after the track.
export interface LyricsFile {
  path: string
  cue?: { no: number; title: string }
}

export interface LyricsIo {
  // the text of a file, or undefined when it is not there or too big
  readText(path: string): Promise<string | undefined>
  tags(path: string): Promise<ILyricsTag[] | undefined>
}

// Characters Windows doesn't allow in a file name; rippers put "_" there.
const safeName = (s: string): string => s.replace(/[\\/:*?"<>|]/g, '_').trim()

// Where the .lrc may be: "03 Red Water.flac" has "03 Red Water.lrc". A CUE
// track's is named after it, as rippers and lyrics tools name them.
export function lrcPaths(f: LyricsFile): string[] {
  if (!f.cue) {
    const name = basename(f.path)
    const dot = name.lastIndexOf('.')
    const stem = join(dirname(f.path), dot > 0 ? name.slice(0, dot) : name)
    return [stem + '.lrc', stem + '.LRC']
  }
  const title = safeName(f.cue.title)
  if (!title) return []
  const no = String(f.cue.no).padStart(2, '0')
  const dir = dirname(f.path)
  return [`${no} ${title}`, `${no} - ${title}`, `${no}. ${title}`, title].map((n) =>
    join(dir, n + '.lrc')
  )
}

// The words in the tags. Synced words win; times counted in MPEG frames
// can't be turned into seconds here, so they give plain words.
export function lyricsFromTags(tags: ILyricsTag[] | undefined): Lyrics | undefined {
  let plain: Lyrics | undefined
  for (const tag of tags ?? []) {
    let got: Lyrics | undefined
    if (tag.syncText?.length && tag.timeStampFormat === TimestampFormat.milliseconds) {
      // Written back as LRC: music-metadata takes only the first stamp of a
      // line from a text tag and leaves the others in the words, so the
      // parser finds them again.
      got = parseLyricsText(
        tag.syncText.map((s) => `${stamp((s.timestamp ?? 0) / 1000)}${s.text}`).join('\n')
      )
    } else if (tag.syncText?.length && !tag.text) {
      got = parseLyricsText(tag.syncText.map((s) => s.text).join('\n'))
    } else if (tag.text) got = parseLyricsText(tag.text)
    if (got && 'synced' in got) return got
    plain ??= got
  }
  return plain
}

function stamp(t: number): string {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `[${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}]`
}

// An .lrc wins over the tags. Undefined when the song has no words, or its
// files can't be read.
export async function readLyrics(
  f: LyricsFile,
  io: LyricsIo = fileIo
): Promise<Lyrics | undefined> {
  for (const p of lrcPaths(f)) {
    const text = await io.readText(p).catch(() => undefined)
    const got = text === undefined ? undefined : parseLyricsText(text)
    if (got) return got
  }
  // a disc image's tags are for the whole disc
  if (f.cue) return undefined
  return lyricsFromTags(await io.tags(f.path).catch(() => undefined))
}

// Reads at most maxLrcBytes; a bigger file is not words.
async function readText(path: string): Promise<string | undefined> {
  let fh
  try {
    fh = await open(path, 'r')
  } catch {
    return undefined
  }
  try {
    const s = await fh.stat()
    if (!s.isFile() || s.size > maxLrcBytes) return undefined
    const buf = new Uint8Array(s.size)
    const { bytesRead } = await fh.read(buf, 0, s.size, 0)
    // same text rules as a cue sheet: UTF-8 or UTF-16, else an old code page
    return decodeCue(buf.subarray(0, bytesRead))
  } finally {
    await fh.close()
  }
}

const fileIo: LyricsIo = {
  readText,
  tags: async (path) => (await readTags(path, { skipCovers: true })).common.lyrics
}
