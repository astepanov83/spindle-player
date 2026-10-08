// Made pictures for Cover.svelte (ticket 103): one per style, seed, colors,
// theme and size bucket, drawn a few at a time and kept as blob URLs.
import type { NoCover } from '../../../shared/settings'
import type { ThemeName } from '../../../shared/theme'
import { PictureCache } from './cache'
import type { PictureArt } from '../../../shared/library'
import { hashOf } from './drawing'
import { drawPicture, styleFor } from './draw'
import { familyOf } from './genre'
import { TurnQueue } from './queue'

export const buckets = [48, 128, 256, 512] as const
export type Bucket = (typeof buckets)[number]

// The smallest bucket a box this wide (CSS px) fits in. Under 64px is the
// small one, where type shows only initials.
export function bucketOf(size: number): Bucket {
  if (size < 64) return 48
  return buckets.find((b) => b >= size) ?? 512
}

// Canvas pixels: the small bucket is drawn at 64 so it stays sharp up to
// there, and a sharp screen gets more.
export function pixelsOf(bucket: Bucket, dpr = globalThis.devicePixelRatio ?? 1): number {
  return Math.round((bucket === 48 ? 64 : bucket) * Math.min(2, Math.max(1, dpr)))
}

// The colors a picture is drawn in (main and accent), or '' when they come
// from the seed. In the key, since a station's logo can bring new colors for
// the same seed, and the picture must follow the tint.
export const colorsOf = (art: PictureArt, theme: ThemeName): string =>
  art.palette ? art.palette[theme].slice(0, 2).join('') : ''

// What the drawing reads from the item besides the seed and colors, hashed,
// so a rescan that changes it (a track added, a title retagged) draws again:
// the album id stays the same then. Sound with no loudness yet is rings, and
// shares its key. An artist's picture shows their initials, from the title.
export function detailOf(style: NoCover, art: PictureArt, artist = false): string {
  const read = readOf(style, art, artist)
  return read ? ':' + hashOf(read).toString(36) : ''
}

function readOf(style: NoCover, art: PictureArt, artist: boolean): string {
  const title = art.title ?? ''
  const lengths = (art.lengths ?? []).join(',')
  switch (style) {
    case 'genre':
      return familyOf(art.genre)
    case 'type':
      return artist ? title : `${title}\0${art.artist ?? ''}`
    case 'rings':
      return artist ? title : lengths
    case 'sound':
      return `${artist ? title : ''}\0${lengths}\0${(art.loudness ?? []).join(',')}`
    default:
      return ''
  }
}

export function pictureKey(
  asked: NoCover,
  art: PictureArt & { seed: string },
  theme: ThemeName,
  bucket: Bucket,
  artist = false
): string {
  const style = styleFor(asked, art)
  return `${artist ? 'artist:' : ''}${style}${detailOf(style, art, artist)}|${theme}|${bucket}|${colorsOf(art, theme)}|${art.seed}`
}

// A few thousand: a big library's whole Albums grid at one size. The bytes
// cap busy pictures (genre's blurs) drawn big on a sharp screen.
const cache = new PictureCache(
  { create: (b) => URL.createObjectURL(b), revoke: (u) => URL.revokeObjectURL(u) },
  4000,
  150 * 1024 * 1024
)

// When the page is idle between frames: drawing a tile takes 1-2ms, and a
// grid row drawn in one frame drops frames while scrolling (seen under Xvfb).
const idle = (): Promise<void> =>
  new Promise((go) =>
    typeof requestIdleCallback === 'function'
      ? requestIdleCallback(() => go(), { timeout: 200 })
      : setTimeout(go, 0)
  )

// Two drawings at a time, each started in idle time.
const queue = new TurnQueue(2, idle)

export const cachedPicture = (key: string): string | undefined => cache.get(key)

// A tile shows or waits for the picture until the returned function is
// called: a held picture is not dropped from the cache, and a drawing no
// tile holds is not made.
export const holdPicture = (key: string): (() => void) => cache.hold(key)

export function loadPicture(
  key: string,
  style: NoCover,
  art: PictureArt & { seed: string },
  theme: ThemeName,
  bucket: Bucket,
  artist = false
): Promise<string | undefined> {
  return cache.load(key, () =>
    queue.run(
      () => drawPicture(style, art, theme, pixelsOf(bucket), bucket === 48, artist),
      () => cache.held(key)
    )
  )
}
