// The queues and what plays, saved in queue.json so a restart carries on where
// you left off. Version 2 holds item keys (ticket 055); main converts an older
// file once at start (main/convert-files.ts).
import type { PluginId } from './plugins'
import { isKeyOfKind, itemKey, splitKey, type ItemKey } from './plugins/items'
import { isStationId } from './stations'

// What "From <from>" opens (ticket 040): a page of a plugin, or of the core
// for a playlist. None for a list with no page of its own (a search, Classic's Songs).
export interface QueueLink {
  plugin: PluginId | 'core'
  // "album/<id>", "artist/<key>", "folder/<path key>" (files), "episode/<album id>"
  // (mfp), "playlist/<id>" (core)
  page: string
}

export type LinkKind = 'album' | 'artist' | 'folder' | 'episode' | 'playlist'

const linkOwners: Record<LinkKind, QueueLink['plugin']> = {
  album: 'files',
  artist: 'files',
  folder: 'files',
  episode: 'mfp',
  playlist: 'core'
}

export function queueLink(kind: LinkKind, id: string): QueueLink {
  return { plugin: linkOwners[kind], page: `${kind}/${id}` }
}

// The page a link opens, split at the first "/". Undefined for one this
// version doesn't know.
export function linkTarget(link: QueueLink): { kind: LinkKind; id: string } | undefined {
  const at = link.page.indexOf('/')
  const kind = link.page.slice(0, at)
  const id = link.page.slice(at + 1)
  if (at < 0 || !id || !Object.hasOwn(linkOwners, kind)) return undefined
  if (linkOwners[kind as LinkKind] !== link.plugin) return undefined
  return { kind: kind as LinkKind, id }
}

// The track queue: songs of any plugin whose items have a length.
export interface SavedQueue {
  items: ItemKey[]
  index: number
  from: string
  link?: QueueLink
  // seconds into the current song
  pos: number
  // songs right after the current one put there with "Play next" (ticket 037)
  next?: number
}

// What queue.json holds. A live item (a radio station) plays apart from the
// track queue, which waits with its list and place (ticket 027).
export interface SavedQueues {
  version: 2
  track: SavedQueue
  live: { current: ItemKey | null }
  active: 'track' | 'live'
}

// What plays: sent on its own when it changes. Main turns it into `live` and `active`.
export type SavedPlaying = { kind: 'queue' } | { kind: 'radio'; station: string }

export function emptyQueue(): SavedQueue {
  return { items: [], index: 0, from: '', pos: 0 }
}

export function emptyQueues(): SavedQueues {
  return { version: 2, track: emptyQueue(), live: { current: null }, active: 'track' }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function parseLink(raw: unknown): QueueLink | undefined {
  if (!isObject(raw) || typeof raw.plugin !== 'string' || typeof raw.page !== 'string') return
  if (raw.page.length > 5000) return
  const link = { plugin: raw.plugin, page: raw.page } as QueueLink
  return linkTarget(link) ? link : undefined
}

// Anything wrong with the list gives an empty queue; a bad index or position
// is pulled back into range.
export function parseSavedQueue(raw: unknown): SavedQueue {
  if (!isObject(raw) || !Array.isArray(raw.items)) return emptyQueue()
  const items = raw.items.filter((t) => isKeyOfKind(t, 'track'))
  if (!items.length) return emptyQueue()
  const index =
    typeof raw.index === 'number' && Number.isInteger(raw.index)
      ? Math.min(items.length - 1, Math.max(0, raw.index))
      : 0
  const pos = typeof raw.pos === 'number' && Number.isFinite(raw.pos) ? Math.max(0, raw.pos) : 0
  const from = typeof raw.from === 'string' ? raw.from.slice(0, 500) : ''
  const link = parseLink(raw.link)
  const next = isCount(raw.next) ? Math.min(raw.next, items.length - 1 - index) : 0
  return {
    items,
    index,
    from,
    ...(link ? { link } : {}),
    pos,
    ...(next > 0 ? { next } : {})
  }
}

// The whole file. A bad live item leaves the track queue playing.
export function parseSavedQueues(raw: unknown): SavedQueues {
  if (!isObject(raw)) return emptyQueues()
  const current =
    isObject(raw.live) && isKeyOfKind(raw.live.current, 'live') ? raw.live.current : null
  return {
    version: 2,
    track: parseSavedQueue(raw.track),
    live: { current },
    active: raw.active === 'live' && current ? 'live' : 'track'
  }
}

// Sets what plays, keeping the track queue's list and place, and the live
// item when the track queue takes over. Returns the same object when nothing
// changed or the message is bad.
export function applyPlaying(q: SavedQueues, raw: unknown): SavedQueues {
  if (!isObject(raw)) return q
  if (raw.kind === 'queue') return q.active === 'track' ? q : { ...q, active: 'track' }
  if (raw.kind !== 'radio' || !isStationId(raw.station)) return q
  const current = itemKey('radio', raw.station)
  if (q.active === 'live' && q.live.current === current) return q
  return { ...q, live: { current }, active: 'live' }
}

// The station a saved live item is, for the radio store until it is a plugin (057).
export function savedStation(q: SavedQueues): string | undefined {
  const k = q.active === 'live' && q.live.current ? splitKey(q.live.current) : undefined
  return k?.plugin === 'radio' ? k.id : undefined
}

// Version 2 with a track queue. Anything else is copied aside before the
// first save; an older file is converted (main/convert-files.ts).
export function isKnownQueueFile(raw: unknown): boolean {
  return isObject(raw) && raw.version === 2 && isObject(raw.track) && Array.isArray(raw.track.items)
}

// Where the queue is: the current song and seconds into it. Sent on every song
// change and every few seconds, without the list, which can hold 50k ids.
export interface QueuePlace {
  index: number
  pos: number
  // Play next songs after it; left out for none
  next?: number
}

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0
}

// Moves the saved queue to a new place. Returns the same object when nothing
// changed or the message is bad (an index outside the list, a broken position).
export function applyPlace(q: SavedQueue, raw: unknown): SavedQueue {
  if (!isObject(raw) || !q.items.length) return q
  const { index, pos } = raw
  if (typeof index !== 'number' || !Number.isInteger(index)) return q
  if (index < 0 || index >= q.items.length) return q
  if (typeof pos !== 'number' || !Number.isFinite(pos) || pos < 0) return q
  const next = raw.next ?? 0
  if (next !== 0 && (!isCount(next) || index + next >= q.items.length)) return q
  if (index === q.index && pos === q.pos && next === (q.next ?? 0)) return q
  const moved = { ...q, index, pos }
  if (next) moved.next = next
  else delete moved.next
  return moved
}
