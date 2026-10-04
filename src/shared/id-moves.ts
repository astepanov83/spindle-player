// Track ids that changed because their file is now reached by another path
// (decision 87 picks one path for a folder reached two ways). The library
// process finds them once, and main and the page rename them in playlists and
// the queue, so those songs don't turn into hidden entries. Only keys of the
// plugin that sent the moves change: another plugin's ids are its own.
import type { PluginId } from './plugins'
import { itemKey, splitKey, type ItemKey } from './plugins/items'
import type { Playlist } from './playlists'
import type { SavedQueues } from './saved-queue'

// old track id -> new track id
export type IdMoves = Record<string, string>

const moved = (id: string, moves: IdMoves): string => (Object.hasOwn(moves, id) ? moves[id] : id)

// The plugin's id a key moves to, if it moves.
function movedId(key: ItemKey, plugin: PluginId, moves: IdMoves): string | undefined {
  const k = splitKey(key)
  return k?.plugin === plugin && Object.hasOwn(moves, k.id) ? moves[k.id] : undefined
}

// The same list when nothing in it moved.
export function moveKeys(keys: ItemKey[], plugin: PluginId, moves: IdMoves): ItemKey[] {
  if (!keys.some((key) => movedId(key, plugin, moves) !== undefined)) return keys
  return keys.map((key) => {
    const to = movedId(key, plugin, moves)
    return to === undefined ? key : itemKey(plugin, to)
  })
}

// A song is in a playlist once, also when both its old and new id were there.
export function movePlaylists(list: Playlist[], plugin: PluginId, moves: IdMoves): Playlist[] {
  let changed = false
  const out = list.map((p) => {
    const items = moveKeys(p.items, plugin, moves)
    if (items === p.items) return p
    changed = true
    return { ...p, items: [...new Set(items)] }
  })
  return changed ? out : list
}

export function moveQueue(q: SavedQueues, plugin: PluginId, moves: IdMoves): SavedQueues {
  const items = moveKeys(q.track.items, plugin, moves)
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
