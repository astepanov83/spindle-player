// queue.json and playlists.json from before item keys (ticket 055) held bare
// library track ids. They are turned into keys once at start.
import { parsePlaylists, type Playlist } from '../shared/playlists'
import type { ItemKey } from '../shared/plugins/items'
import {
  parseSavedQueues,
  queueLink,
  type LinkKind,
  type QueueLink,
  type SavedQueues
} from '../shared/saved-queue'

// Which plugin an old id belongs to; only the plugins know (main/plugins/old-ids.ts).
export interface OldIds {
  // the key of an old track id
  track(id: string): ItemKey
  // the "From" link of an old album, which may be another plugin's page
  album(id: string): QueueLink
  // the live item an old queue file was playing, if any
  live(raw: Record<string, unknown>): ItemKey | undefined
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// Anything that is not a track id is left as it is, for the parser to drop.
function toKey(id: unknown, ids: OldIds): unknown {
  if (typeof id !== 'string' || !id) return id
  return ids.track(id)
}

const oldLinkKinds: readonly string[] = ['album', 'artist', 'folder', 'playlist']

// { kind, id } before; an album may be another plugin's page.
function convertLink(raw: unknown, ids: OldIds): QueueLink | undefined {
  if (!isObject(raw) || typeof raw.kind !== 'string' || !oldLinkKinds.includes(raw.kind)) return
  if (typeof raw.id !== 'string' || !raw.id) return
  return raw.kind === 'album' ? ids.album(raw.id) : queueLink(raw.kind as LinkKind, raw.id)
}

// The old file had no version.
export function isOldQueueFile(raw: unknown): raw is Record<string, unknown> {
  return isObject(raw) && !('version' in raw)
}

// A station playing becomes the live item. The result goes through the
// version 2 checks, so a bad place is pulled into range as before.
export function convertQueue(raw: Record<string, unknown>, ids: OldIds): SavedQueues {
  const live = ids.live(raw)
  return parseSavedQueues({
    version: 2,
    track: {
      items: Array.isArray(raw.items) ? raw.items.map((id) => toKey(id, ids)) : [],
      index: raw.index,
      pos: raw.pos,
      from: raw.from,
      next: raw.next,
      link: convertLink(raw.link, ids)
    },
    live: { current: live ?? null },
    active: live ? 'live' : 'track'
  })
}

// Version 1, or none at all: both had `trackIds`.
export function isOldPlaylistsFile(raw: unknown): raw is Record<string, unknown> {
  return isObject(raw) && (raw.version === 1 || !('version' in raw))
}

export function convertPlaylists(raw: Record<string, unknown>, ids: OldIds): Playlist[] {
  const list = Array.isArray(raw.playlists) ? raw.playlists : []
  const playlists = list.map((p) => {
    if (!isObject(p)) return p
    const { trackIds, ...rest } = p
    return { ...rest, items: Array.isArray(trackIds) ? trackIds.map((id) => toKey(id, ids)) : [] }
  })
  return parsePlaylists({ version: 2, playlists })
}
