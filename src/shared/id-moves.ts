// Track ids that changed because their file is now reached by another path
// (decision 87 picks one path for a folder reached two ways). The library
// process finds them once, and main and the page rename them in playlists and
// the queue, so those songs don't turn into hidden entries. Only keys of the
// files plugin move: another plugin's ids are its own.
import { itemKey, splitKey, type ItemKey } from './plugins/items'
import type { Playlist } from './playlists'
import type { SavedQueues } from './saved-queue'

// old track id -> new track id
export type IdMoves = Record<string, string>

const moved = (id: string, moves: IdMoves): string => (Object.hasOwn(moves, id) ? moves[id] : id)

// The files track id a key moves from, if it moves.
function movedId(key: ItemKey, moves: IdMoves): string | undefined {
  const k = splitKey(key)
  return k?.plugin === 'files' && Object.hasOwn(moves, k.id) ? moves[k.id] : undefined
}

// The same list when nothing in it moved.
export function moveKeys(keys: ItemKey[], moves: IdMoves): ItemKey[] {
  if (!keys.some((key) => movedId(key, moves) !== undefined)) return keys
  return keys.map((key) => {
    const to = movedId(key, moves)
    return to === undefined ? key : itemKey('files', to)
  })
}

// A song is in a playlist once, also when both its old and new id were there.
export function movePlaylists(list: Playlist[], moves: IdMoves): Playlist[] {
  let changed = false
  const out = list.map((p) => {
    const items = moveKeys(p.items, moves)
    if (items === p.items) return p
    changed = true
    return { ...p, items: [...new Set(items)] }
  })
  return changed ? out : list
}

export function moveQueue(q: SavedQueues, moves: IdMoves): SavedQueues {
  const items = moveKeys(q.track.items, moves)
  return items === q.track.items ? q : { ...q, track: { ...q.track, items } }
}

// Two finds in a row: a -> b, then b -> c gives a -> c.
export function mergeMoves(a: IdMoves, b: IdMoves): IdMoves {
  const out: IdMoves = {}
  for (const [from, to] of Object.entries(a)) out[from] = moved(to, b)
  for (const [from, to] of Object.entries(b)) if (!Object.hasOwn(out, from)) out[from] = to
  return out
}

// The moves whose new id is already in the library (`now`), and the rest,
// which wait for a library that has them (`later`).
export function splitMoves(
  moves: IdMoves,
  has: (id: string) => boolean
): { now: IdMoves; later: IdMoves } {
  const now: IdMoves = {}
  const later: IdMoves = {}
  for (const [from, to] of Object.entries(moves)) (has(to) ? now : later)[from] = to
  return { now, later }
}
