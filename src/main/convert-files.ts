// queue.json and playlists.json from before item keys (ticket 055) held bare
// library track ids. They are turned into keys once at start: an id of a
// Music For Programming song becomes "mfp:<id>", any other "files:<id>".
import { defaultPalettes } from '../shared/palette'
import { parsePlaylists, type Playlist } from '../shared/playlists'
import { itemKey } from '../shared/plugins/items'
import {
  parseSavedQueues,
  queueLink,
  type LinkKind,
  type QueueLink,
  type SavedQueues
} from '../shared/saved-queue'
import { isStationId } from '../shared/stations'
import { readJsonFile } from './json-file'
import { mfpLibrary } from './library/mfp-library'
import { parseMfp } from './library/mfp-store'

// The ids Music For Programming gives its songs and episodes.
export interface MfpIds {
  tracks: ReadonlySet<string>
  albums: ReadonlySet<string>
}

// From mfp.json, with no network. The library makes the ids from it, so they
// come out the same. A missing or broken file knows no ids: all are files'.
export function readMfpIds(path: string): MfpIds {
  const read = readJsonFile(path)
  const episodes = read.kind === 'ok' ? parseMfp(read.value).episodes : []
  const noArt = { palette: defaultPalettes, cover: '', coverLarge: '' }
  const lib = mfpLibrary(episodes, () => noArt)
  return {
    tracks: new Set(lib.tracks.map((t) => t.id)),
    albums: new Set(lib.albums.map((a) => a.id))
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// Anything that is not a track id is left as it is, for the parser to drop.
function toKey(id: unknown, mfp: MfpIds): unknown {
  if (typeof id !== 'string' || !id) return id
  return itemKey(mfp.tracks.has(id) ? 'mfp' : 'files', id)
}

const oldLinkKinds: readonly string[] = ['album', 'artist', 'folder', 'playlist']

// { kind, id } before; an album that is an episode opens MFP's page.
function convertLink(raw: unknown, mfp: MfpIds): QueueLink | undefined {
  if (!isObject(raw) || typeof raw.kind !== 'string' || !oldLinkKinds.includes(raw.kind)) return
  if (typeof raw.id !== 'string' || !raw.id) return
  const episode = raw.kind === 'album' && mfp.albums.has(raw.id)
  return queueLink(episode ? 'episode' : (raw.kind as LinkKind), raw.id)
}

// The old file had no version.
export function isOldQueueFile(raw: unknown): raw is Record<string, unknown> {
  return isObject(raw) && !('version' in raw)
}

// Radio playing (`kind: 'radio'`) becomes the live item. The result goes
// through the version 2 checks, so a bad place is pulled into range as before.
export function convertQueue(raw: Record<string, unknown>, mfp: MfpIds): SavedQueues {
  const station = raw.kind === 'radio' && isStationId(raw.station) ? raw.station : undefined
  return parseSavedQueues({
    version: 2,
    track: {
      items: Array.isArray(raw.items) ? raw.items.map((id) => toKey(id, mfp)) : [],
      index: raw.index,
      pos: raw.pos,
      from: raw.from,
      next: raw.next,
      link: convertLink(raw.link, mfp)
    },
    live: { current: station ? itemKey('radio', station) : null },
    active: station ? 'live' : 'track'
  })
}

// Version 1, or none at all: both had `trackIds`.
export function isOldPlaylistsFile(raw: unknown): raw is Record<string, unknown> {
  return isObject(raw) && (raw.version === 1 || !('version' in raw))
}

export function convertPlaylists(raw: Record<string, unknown>, mfp: MfpIds): Playlist[] {
  const list = Array.isArray(raw.playlists) ? raw.playlists : []
  const playlists = list.map((p) => {
    if (!isObject(p)) return p
    const { trackIds, ...rest } = p
    return { ...rest, items: Array.isArray(trackIds) ? trackIds.map((id) => toKey(id, mfp)) : [] }
  })
  return parsePlaylists({ version: 2, playlists })
}
