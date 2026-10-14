// Songs opened from the system (ticket 124), read on demand in the library
// process. A file in the library is its library song. Any other is read like
// a scan reads it (tags, cover, ReplayGain, a cue sheet's tracks) into an
// index of its own, grouped the same way, and sent as songs that are not in
// the library: nothing of them goes in library.json.
import { basename, join } from 'path'
import type { Album, Art, Track } from '../../../shared/library'
import { looseId, looseParts, type LooseSong } from '../../../shared/plugins/files/loose'
import { shortHash } from '../../ids'
import { resolveCueFile } from './cue-tracks'
import type { BuiltLibrary } from './group'
import type { LyricsFile } from './lyrics-files'
import { dirOf, emptyIndex } from './merge'
import { extOf, isAudioFile, pickFolderImage } from './tags'
import type { CueEntry, FileEntry, FolderImage, LibraryIndex } from './types'

// The disk, and the scan's own readers, handed in so a test can fake them.
export interface LooseReads {
  // undefined when it is not there
  stat(path: string): Promise<{ mtime: number; size: number; isFile: boolean } | undefined>
  readFile(path: string, mtime: number, size: number): Promise<FileEntry>
  readCue(f: { path: string; mtime: number; size: number }): Promise<CueEntry>
  // a folder's names; none when it can't be read
  list(dir: string): Promise<string[]>
  readImage(dir: string, path: string): Promise<FolderImage | undefined>
  // A picture the reads sent to main is made, or a short wait passed: the
  // song is sent once, so its cover should be in it.
  coverMade(hash: string): Promise<void>
}

// What the library has, so a file in it plays as its library song.
export interface LooseLibrary {
  files: ReadonlyMap<string, FileEntry>
  cues: ReadonlyMap<string, CueEntry>
  images: ReadonlyMap<string, FolderImage>
  palettes: LibraryIndex['palettes']
  hasTrack(id: string): boolean
  // groups an index into songs, as the library's are (buildLibrary)
  build(ix: LibraryIndex): BuiltLibrary
}

export interface LooseOpened {
  // for each item asked, in order, the page's ids it gave; undefined: gone
  items: (string[] | undefined)[]
  songs: LooseSong[]
  // media id -> the file, to serve it (spindle://media/<id>)
  media: Map<string, FileEntry>
  // loose id -> where its words are (ticket 120)
  words: Map<string, LyricsFile>
  // the pictures they show, kept from the cover prune
  covers: Set<string>
}

// The picture of a song not in the library: its own, else its album's.
function artOf(t: Track, album: Album | undefined): Art | undefined {
  if (t.art) return t.art
  if (!album) return undefined
  const { palette, cover, coverLarge, seed, lengths, title, artist } = album
  return { palette, cover, coverLarge, seed, lengths, title, artist }
}

// `items` are paths of audio files and cue sheets, or loose ids (a saved
// queue's). A cue sheet's path gives all its tracks, a loose id of one of its
// tracks only that one. `asLoose`: the items are loose ids the page has, so
// each stays a song not in the library, also when its file is in it now.
export async function openLoose(
  items: string[],
  lib: LooseLibrary,
  reads: LooseReads,
  asLoose = false
): Promise<LooseOpened> {
  const out: LooseOpened = {
    items: [],
    songs: [],
    media: new Map(),
    words: new Map(),
    covers: new Set()
  }
  const lists = new Map<string, Promise<string[]>>()
  const list = (dir: string): Promise<string[]> => {
    let l = lists.get(dir)
    if (!l) lists.set(dir, (l = reads.list(dir)))
    return l
  }

  const mini = (): LibraryIndex => ({ ...emptyIndex(), palettes: lib.palettes })

  // the folder's cover image, as the walk would pick it
  const addImage = async (ix: LibraryIndex, dir: string): Promise<void> => {
    const known = lib.images.get(dir)
    if (known) return void ix.images.set(dir, known)
    const pick = pickFolderImage(await list(dir), basename(dir))
    const im = pick && (await reads.readImage(dir, join(dir, pick.name)))
    if (im) ix.images.set(dir, im)
  }

  const coversMade = async (ix: LibraryIndex): Promise<void> => {
    const hashes = new Set<string>()
    for (const e of ix.files.values()) if (e.cover) hashes.add(e.cover)
    for (const im of ix.images.values()) if (im.cover) hashes.add(im.cover)
    for (const h of hashes) out.covers.add(h)
    await Promise.all([...hashes].map((h) => reads.coverMade(h)))
  }

  const entryOf = async (path: string): Promise<FileEntry | undefined> => {
    const known = lib.files.get(path)
    if (known) return known
    const s = await reads.stat(path)
    return s?.isFile ? reads.readFile(path, s.mtime, s.size) : undefined
  }

  const take = (t: Track, id: string, built: BuiltLibrary, ix: LibraryIndex): void => {
    const album = built.data.albums.find((a) => a.id === t.albumId)
    const track: Track = { ...t, id, folder: -1 }
    const art = artOf(t, album)
    if (art) track.art = art
    const file = t.part?.file ?? t.id
    out.songs.push({ track, file })
    const path = built.paths.get(file)
    const entry = path && ix.files.get(path)
    if (entry) out.media.set(file, entry)
  }

  const openFile = async (path: string): Promise<string[] | undefined> => {
    const libId = shortHash(path)
    if (!asLoose && lib.files.has(path) && lib.hasTrack(libId)) return [libId]
    const entry = await entryOf(path)
    if (!entry) return undefined
    const ix = mini()
    ix.files.set(path, entry)
    await addImage(ix, dirOf(path))
    await coversMade(ix)
    const built = lib.build(ix)
    const t = built.data.tracks[0]
    if (!t) return undefined
    const id = looseId(path)
    take(t, id, built, ix)
    out.words.set(id, { path })
    return [id]
  }

  const openCue = async (path: string, no: number | undefined): Promise<string[] | undefined> => {
    let cue = lib.cues.get(path)
    if (!cue) {
      const s = await reads.stat(path)
      if (!s?.isFile) return undefined
      cue = await reads.readCue({ path, mtime: s.mtime, size: s.size })
    }
    const sheet = cue.sheet
    if (!sheet) return undefined
    const dir = dirOf(path)
    const audio = (await list(dir)).filter(isAudioFile).map((n) => join(dir, n))
    const ix = mini()
    ix.cues.set(path, cue)
    for (const name of sheet.files) {
      const image = resolveCueFile(
        path,
        name,
        audio,
        (p) => audio.includes(p),
        sheet.files.length === 1
      )
      const entry = image && (await entryOf(image))
      if (image && entry) ix.files.set(image, entry)
    }
    if (!ix.files.size) return undefined
    await addImage(ix, dir)
    await coversMade(ix)
    const built = lib.build(ix)
    const tracks = built.data.tracks
      .filter((t) => no === undefined || t.no === no)
      .sort((a, b) => a.disc - b.disc || a.no - b.no)
    const ids: string[] = []
    for (const t of tracks) {
      if (!asLoose && lib.hasTrack(t.id)) {
        ids.push(t.id)
        continue
      }
      const id = looseId(path, t.no)
      take(t, id, built, ix)
      const image = built.paths.get(t.part?.file ?? t.id)
      if (image)
        out.words.set(
          id,
          t.part ? { path: image, cue: { no: t.no, title: t.title } } : { path: image }
        )
      ids.push(id)
    }
    return ids.length ? ids : undefined
  }

  for (const item of items) {
    const parts = looseParts(item)
    let ids: string[] | undefined
    if (!parts) ids = undefined
    else if (extOf(parts.path) === 'cue') ids = await openCue(parts.path, parts.no)
    else if (parts.no === undefined && isAudioFile(basename(parts.path)))
      ids = await openFile(parts.path)
    out.items.push(ids)
  }
  return out
}
