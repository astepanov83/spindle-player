// Files the index knows under one path that a scan now finds under another:
// the same file on disk (same device and inode), reached by another path. This
// happens once for folders reached two ways, when decision 87 picks the other
// path. The entry moves with its tags, and the old track ids are mapped to the
// new ones for playlists and the queue.
import { cueTracks } from './cue-tracks'
import { cueTrackId, shortHash } from './ids'
import { isUnder } from './merge'
import type { IdMoves } from '../../shared/id-moves'
import type { LibraryIndex } from './types'

// The same for every path that reaches one file. None when the file system
// gives no inode. From a bigint stat: an inode can be past 2^53 (Btrfs, NFS).
export function fileKey(s: { dev: bigint; ino: bigint }): string | undefined {
  return s.ino ? `${s.dev}:${s.ino}` : undefined
}

// What a scan has to look at to find moves. `added`: paths found that the
// index doesn't have (files and cue sheets), with their key. `gone`: paths the
// index has that were not found, inside the music folders and not under a
// folder that could not be read (an unplugged drive keeps its songs; they
// didn't move). Both are empty when either would be, so nothing is stat'ed.
// `had`: whether the index had a path when the scan started; the scan reads
// new files while the walk goes on, so the index may have them by now.
export function movePlan(
  ix: LibraryIndex,
  found: { path: string; key?: string }[],
  folders: string[],
  skipped: string[],
  had: (path: string) => boolean = (p) => ix.files.has(p) || ix.cues.has(p)
): { added: Map<string, string>; gone: string[] } {
  const added = new Map<string, string>()
  for (const f of found) if (f.key && !had(f.path)) added.set(f.path, f.key)
  if (!added.size) return { added, gone: [] }
  const present = new Set(found.map((f) => f.path))
  const gone = [...ix.files.keys(), ...ix.cues.keys()].filter(
    (p) =>
      !present.has(p) && folders.some((f) => isUnder(p, f)) && !skipped.some((s) => isUnder(p, s))
  )
  return { added: gone.length ? added : new Map(), gone }
}

// Old path -> new path. `gone`: paths that left the index this scan, with
// their key now. `added`: paths new to the index, with theirs. A key that two
// new paths share (hard links) is left out, since which one it is isn't known.
export function findMoves(
  gone: Map<string, string>,
  added: Map<string, string>
): Map<string, string> {
  const byKey = new Map<string, string | null>()
  for (const [path, key] of added) byKey.set(key, byKey.has(key) ? null : path)
  const moves = new Map<string, string>()
  for (const [path, key] of gone) {
    const to = byKey.get(key)
    if (to) moves.set(path, to)
  }
  return moves
}

// Old id -> new id for every song whose file moved: the file's own id (a song,
// or a disc image played as one), and each cue track of a disc image. Uses
// the index before the move.
export function idMoves(ix: LibraryIndex, moves: Map<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [from, to] of moves) if (ix.files.has(from)) out[shortHash(from)] = shortHash(to)
  for (const item of cueTracks(ix).items) {
    const to = moves.get(item.entry.path)
    if (to && item.part && item.entry.track !== undefined)
      out[item.id] = cueTrackId(to, item.entry.track)
  }
  return out
}

// What is still to be confirmed once main saved `saved`: an entry changed
// since (a newer move of the same id) stays.
export function confirmMoves(pending: IdMoves, saved: IdMoves): IdMoves {
  const out: IdMoves = {}
  for (const [from, to] of Object.entries(pending))
    if (!Object.hasOwn(saved, from) || saved[from] !== to) out[from] = to
  return out
}

// Moves index entries (files and cue sheets) to their new paths, keeping what
// was read, so they are not read again.
export function moveEntries(ix: LibraryIndex, moves: Map<string, string>): void {
  moveIn(ix.files, moves)
  moveIn(ix.cues, moves)
}

function moveIn<T extends { path: string }>(map: Map<string, T>, moves: Map<string, string>): void {
  for (const [from, to] of moves) {
    const e = map.get(from)
    if (!e || map.has(to)) continue
    map.delete(from)
    map.set(to, { ...e, path: to })
  }
}
