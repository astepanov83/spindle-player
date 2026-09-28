// Lists the music folders: audio files, cue sheets and folder images.
import { readdir, realpath, stat } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { eachPaced, type Pacer } from './pacer'
import {
  isArtFolder,
  isAudioFile,
  isCueFile,
  pickArtImage,
  pickFolderImage,
  type FolderImagePick
} from './tags'

// A folder's cover image. It may be in a scans subfolder of that folder.
export interface ListedImage {
  dir: string
  path: string
}

export interface Listing {
  files: string[]
  cues: string[]
  images: ListedImage[]
  skipped: string[]
}

interface Entry {
  name: string
  isDirectory(): boolean
  isFile(): boolean
  isSymbolicLink(): boolean
}

// The file calls the walk makes, so a test can change their order and timing.
export interface WalkFs {
  realpath(path: string): Promise<string>
  readdir(path: string): Promise<Entry[]>
  stat(path: string): Promise<{ isDirectory(): boolean; isFile(): boolean }>
}

const nodeFs: WalkFs = {
  realpath: (p) => realpath(p),
  readdir: (p) => readdir(p, { withFileTypes: true }),
  stat: (p) => stat(p)
}

interface Dir {
  path: string
  // its path with every symlink resolved
  real: string
  // symlinks followed below the music folder to get here
  links: number
  depth: number
}

const byKey = (a: Dir, b: Dir): number => a.links - b.links || a.depth - b.depth

// A folder reachable by more than one path (a symlink to a folder that is also
// in the library) is walked once, and its songs get their ids from that path.
// So the path must not depend on readdir order or on which answer came first:
// the one that follows the fewest symlinks wins, then the least deep one, then
// the one that sorts first. A folder reached one way keeps the path it has.
export async function walk(
  roots: string[],
  pace: Pacer,
  check: () => void,
  onDir: (files: number) => void = () => {},
  fs: WalkFs = nodeFs
): Promise<Listing> {
  const out: Listing = { files: [], cues: [], images: [], skipped: [] }
  const seenFiles = new Set<string>()
  // real paths already walked, so a symlink loop is walked once
  const seenDirs = new Set<string>()
  // folder -> its best image so far, from itself or its scans folder
  const images = new Map<string, FolderImagePick & ListedImage>()
  const offer = (dir: string, from: string, pick: FolderImagePick | undefined): void => {
    if (!pick) return
    const path = join(from, pick.name)
    const old = images.get(dir)
    // the same rank: the path that sorts first, so walk order doesn't matter
    if (!old || pick.rank < old.rank || (pick.rank === old.rank && path < old.path))
      images.set(dir, { ...pick, dir, path })
  }
  let pending: Dir[] = []
  await eachPaced(roots, pace, async (path) => {
    check()
    try {
      pending.push({ path, real: await fs.realpath(path), links: 0, depth: 0 })
    } catch {
      out.skipped.push(path)
    }
  })
  while (pending.length) {
    // every path of one kind is known before any of them is picked
    const first = pending.reduce((a, b) => (byKey(b, a) < 0 ? b : a))
    const wave = pending.filter((d) => byKey(d, first) === 0)
    pending = pending.filter((d) => byKey(d, first) !== 0)
    wave.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    const picked = wave.filter((d) => {
      if (seenDirs.has(d.real)) return false
      seenDirs.add(d.real)
      return true
    })
    await eachPaced(picked, pace, async (dir) => {
      check()
      let entries
      try {
        entries = await fs.readdir(dir.path)
      } catch {
        out.skipped.push(dir.path)
        return
      }
      const names: string[] = []
      let songs = false
      for (const d of entries) {
        if (d.name.startsWith('.')) continue
        const path = join(dir.path, d.name)
        let isDir = d.isDirectory()
        let isFile = d.isFile()
        let real = join(dir.real, d.name)
        const link = d.isSymbolicLink()
        if (link) {
          try {
            const s = await fs.stat(path)
            isDir = s.isDirectory()
            isFile = s.isFile()
          } catch {
            // a symlink to nothing
            continue
          }
          if (isDir)
            try {
              real = await fs.realpath(path)
            } catch {
              // there, but can't be walked now: keep its songs, like a folder that can't be read
              out.skipped.push(path)
              continue
            }
        }
        if (isDir)
          pending.push({ path, real, links: dir.links + (link ? 1 : 0), depth: dir.depth + 1 })
        else if (isFile) {
          names.push(d.name)
          const audio = isAudioFile(d.name)
          if (audio || isCueFile(d.name)) {
            songs = true
            if (!seenFiles.has(path)) {
              seenFiles.add(path)
              ;(audio ? out.files : out.cues).push(path)
            }
          }
        }
      }
      const name = basename(dir.path)
      // "Covers" with songs in it is an album
      if (dir.depth > 0 && !songs && isArtFolder(name))
        offer(dirname(dir.path), dir.path, pickArtImage(names))
      else offer(dir.path, dir.path, pickFolderImage(names, name))
      onDir(out.files.length)
    })
  }
  out.images = [...images.values()]
    .map(({ dir, path }) => ({ dir, path }))
    .sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0))
  return out
}
