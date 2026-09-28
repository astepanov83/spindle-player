// One scan's walk, stats and reads (ticket 022). The walk hands over each
// folder as it lists it, and its files are stat'ed and read at once, so the
// first songs show a few seconds in, not after a walk of the whole tree.
// Apart from the library process, with the reads handed in, so a test can
// run it on temp folders.
import { stat } from 'fs/promises'
import {
  applyBatch,
  applyCue,
  applyListing,
  emptiedFolders,
  knownDirs,
  planCueReads,
  planReads
} from './merge'
import { eachPaced, Lane, type Pacer } from './pacer'
import { walk, type Found, type ListedImage, type WalkFs } from './walk'
import { fileKey, findMoves, idMoves, moveEntries, movePlan } from './moves'
import type { CueEntry, FileEntry, FolderImage, LibraryIndex } from './types'

// A file or cue sheet the scan found, and its key on disk (see moves.ts).
export interface Seen {
  path: string
  mtime: number
  size: number
  key?: string
}

export interface ScanCount {
  // the walk goes on
  walking: boolean
  // files listed, files to read, and files read
  listed: number
  planned: number
  read: number
}

export interface ScanOptions {
  ix: LibraryIndex
  folders: string[]
  retryFailed: boolean
  // whether a cover is made (or known bad), so a file whose cover is gone is read again
  known(hash: string): boolean
  // files an older tag reader read, read once more
  again?: (e: FileEntry) => boolean
  pace: { dir: Pacer; stat: Pacer; read: Pacer }
  // throws when the scan should stop
  check(): void
  // the index changed in what the page shows
  changed(): void
  // the index changed only in what is saved
  unsaved(): void
  count(c: ScanCount, force: boolean): void
  // the walk, the stats and the reads ended, for the log
  lap(): void
  // the walk ended; `skipped`: folders it could not read
  walked(skipped: string[]): void
  // Files whose path changed (decision 104), after their entries moved:
  // old id -> new id, and how many files moved.
  moved(ids: Record<string, string>, files: number): void
  readFile(path: string, mtime: number, size: number): Promise<FileEntry>
  readCue(f: Seen): Promise<CueEntry>
  readImage(listed: ListedImage, old: FolderImage | undefined): Promise<FolderImage | undefined>
  stat?: (path: string) => Promise<{ mtimeMs: bigint; size: bigint; dev: bigint; ino: bigint }>
  walkFs?: WalkFs
}

// Every file the scan saw. Songs whose files are gone leave only at the end,
// so a partial scan never hides any.
export async function scanFiles(o: ScanOptions): Promise<{ read: number }> {
  const { ix, folders, retryFailed, pace } = o
  const statPath = o.stat ?? ((p: string) => stat(p, { bigint: true }))
  const c: ScanCount = { walking: true, listed: 0, planned: 0, read: 0 }
  const show = (force = false): void => o.count(c, force)
  // Known files are stat'ed to see what changed. New ones are stat'ed in their
  // own lane, so a folder just added doesn't wait behind 50k known files on a
  // Rescan. Cue sheets are read in their own lane, ahead of queued tag reads.
  const statLane = new Lane(pace.stat)
  const newLane = new Lane(pace.stat)
  const cueLane = new Lane(pace.read)
  const readLane = new Lane(pace.read)
  const lanes = [statLane, newLane, cueLane, readLane]
  // a stopped scan, or a job that failed, stops the walk and the other lanes
  const check = (): void => {
    o.check()
    for (const l of lanes) l.check()
  }

  // what the index had before this scan read anything, to find moves and new folders
  const had = new Set([...ix.files.keys(), ...ix.cues.keys()])
  const oldDirs = knownDirs(ix)
  const toRead = (f: Seen): boolean =>
    planReads(ix.files, [f], o.known, retryFailed, o.again).length > 0
  const files: Seen[] = []
  const cues: Seen[] = []
  const images = new Map<string, FolderImage>()
  // the last hand-over of each folder's image; an older one's read is dropped
  const handed = new Map<string, number>()

  const statOf = async (path: string): Promise<Seen | undefined> => {
    check()
    let s
    try {
      s = await statPath(path)
    } catch {
      // gone since the walk
      return undefined
    }
    check()
    // whole ms, as the index keeps them
    return { path, mtime: Number(s.mtimeMs), size: Number(s.size), key: fileKey(s) }
  }

  const readOne = async (f: Seen): Promise<void> => {
    check()
    // moved here from its old path meanwhile (see findMovesNow): it keeps what was read
    if (toRead(f)) {
      const entry = await o.readFile(f.path, f.mtime, f.size)
      check()
      if (applyBatch(ix, [entry])) o.changed()
    }
    c.read++
    show()
  }

  const statFile = async (path: string): Promise<void> => {
    const f = await statOf(path)
    if (!f) return
    files.push(f)
    if (toRead(f)) {
      c.planned++
      readLane.push(() => readOne(f))
    }
  }

  // A file the index doesn't have is read anyway, so it is counted at once.
  const newFile = async (path: string): Promise<void> => {
    const f = await statOf(path)
    if (!f) {
      c.planned--
      return
    }
    files.push(f)
    readLane.push(() => readOne(f))
  }

  const takeFile = (path: string): void => {
    if (had.has(path)) statLane.push(() => statFile(path))
    else {
      c.planned++
      newLane.push(() => newFile(path))
    }
  }

  // A folder's cue sheets are read before its files are taken, so a disc
  // image shows as its tracks from the start, not as one song first. The
  // stats and the reads each hold only their own pacer.
  const statCues = async (found: Found): Promise<void> => {
    const plan: Seen[] = []
    for (const path of found.cues) {
      const s = await statOf(path)
      if (!s) continue
      cues.push(s)
      if (planCueReads(ix.cues, [s], retryFailed).length) plan.push(s)
    }
    if (!plan.length) for (const path of found.files) takeFile(path)
    else
      cueLane.push(async () => {
        for (const s of plan) {
          check()
          const entry = await o.readCue(s)
          check()
          if (applyCue(ix, entry)) o.changed()
        }
        for (const path of found.files) takeFile(path)
      })
  }

  const readFolderImage = async (listed: ListedImage, n: number): Promise<void> => {
    const newest = (): boolean => handed.get(listed.dir) === n
    check()
    if (!newest()) return
    const im = await o.readImage(listed, ix.images.get(listed.dir))
    check()
    // the walk handed a better image over meanwhile; its read wins, whenever it ends
    if (!im || !newest()) return
    images.set(listed.dir, im)
    const old = ix.images.get(listed.dir)
    ix.images.set(listed.dir, im)
    // a new time alone changes only the file, not what the page shows
    if (old?.path !== im.path || old.cover !== im.cover) o.changed()
    else if (old !== im) o.unsaved()
  }

  try {
    const listing = await walk(
      folders,
      pace.dir,
      check,
      (found) => {
        c.listed += found.files.length
        for (const im of found.images) {
          const n = (handed.get(im.dir) ?? 0) + 1
          handed.set(im.dir, n)
          readLane.push(() => readFolderImage(im, n))
        }
        if (found.cues.length) statLane.push(() => statCues(found))
        else for (const path of found.files) takeFile(path)
        show()
      },
      o.walkFs,
      (dir) => !oldDirs.has(dir)
    )
    o.lap()
    // cue sheets hand their folders' files over only once read
    await statLane.idle()
    await cueLane.idle()
    await Promise.all([statLane.idle(), newLane.idle()])
    o.lap()
    check()
    c.walking = false
    show(true)

    const skipped = [...listing.skipped, ...emptiedFolders(ix, folders, listing.files)]
    o.walked(skipped)
    // every path found is known now, also new ones still waiting to be read
    await findMovesNow([...files, ...cues], skipped)
    await readLane.idle()
    check()
    show(true)
    o.lap()
    // Only now that every file was seen: songs whose files are gone leave,
    // and folder images the walk no longer found
    if (
      applyListing(ix, folders, {
        paths: files.map((f) => f.path),
        cues: cues.map((f) => f.path),
        images: [...images.values()],
        skipped
      })
    )
      o.changed()
    return { read: c.read }
  } catch (error) {
    // Jobs still running end before the scan does, so none of them touches
    // the index after the next scan started.
    for (const l of lanes) l.stop(error)
    await Promise.allSettled(lanes.map((l) => l.idle()))
    throw error
  }

  // Files the index has under a path the walk no longer took, found again
  // under another path (decision 87 picks one path for a folder reached two
  // ways). They keep what was read.
  async function findMovesNow(found: Seen[], skipped: string[]): Promise<void> {
    const { added, kept, gone } = movePlan(ix, found, folders, skipped, (p) => had.has(p))
    if (!gone.length) return
    // the old path still reaches the file (a symlink); a deleted file has none
    const goneKeys = new Map<string, string>()
    await eachPaced(gone, pace.stat, async (path) => {
      check()
      try {
        const key = fileKey(await statPath(path))
        if (key) goneKeys.set(path, key)
      } catch {
        // deleted or moved away
      }
    })
    check()
    const moves = findMoves(goneKeys, added, kept)
    if (!moves.size) return
    const ids = idMoves(ix, moves)
    moveEntries(ix, moves)
    o.moved(ids, moves.size)
  }
}
