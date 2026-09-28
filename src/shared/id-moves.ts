// Track ids that changed because their file is now reached by another path
// (decision 87 picks one path for a folder reached two ways). The library
// process finds them once, and main and the page rename them in playlists and
// the queue, so those songs don't turn into hidden entries.
import type { Playlist } from './playlists'
import type { SavedQueue } from './saved-queue'

// old id -> new id
export type IdMoves = Record<string, string>

const moved = (id: string, moves: IdMoves): string => (Object.hasOwn(moves, id) ? moves[id] : id)

// The same list when nothing in it moved.
export function moveIds(ids: string[], moves: IdMoves): string[] {
  if (!ids.some((id) => Object.hasOwn(moves, id))) return ids
  return ids.map((id) => moved(id, moves))
}

// A song is in a playlist once, also when both its old and new id were there.
export function movePlaylists(list: Playlist[], moves: IdMoves): Playlist[] {
  let changed = false
  const out = list.map((p) => {
    const ids = moveIds(p.trackIds, moves)
    if (ids === p.trackIds) return p
    changed = true
    return { ...p, trackIds: [...new Set(ids)] }
  })
  return changed ? out : list
}

export function moveQueue(q: SavedQueue, moves: IdMoves): SavedQueue {
  const items = moveIds(q.items, moves)
  return items === q.items ? q : { ...q, items }
}

// Two finds in a row: a -> b, then b -> c gives a -> c.
export function mergeMoves(a: IdMoves, b: IdMoves): IdMoves {
  const out: IdMoves = {}
  for (const [from, to] of Object.entries(a)) out[from] = moved(to, b)
  for (const [from, to] of Object.entries(b)) if (!Object.hasOwn(out, from)) out[from] = to
  return out
}
