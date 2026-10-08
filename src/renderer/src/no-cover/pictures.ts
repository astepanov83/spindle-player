// Made pictures for Cover.svelte (ticket 103): one per style, seed, theme and
// size bucket, drawn a few at a time and kept as blob URLs.
import type { NoCover } from '../../../shared/settings'
import type { ThemeName } from '../../../shared/theme'
import { PictureCache } from './cache'
import type { PictureArt } from '../../../shared/library'
import { drawPicture } from './draw'

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

export const pictureKey = (
  style: NoCover,
  seed: string,
  theme: ThemeName,
  bucket: Bucket
): string => `${style}|${theme}|${bucket}|${seed}`

// a few thousand: a big library's whole Albums grid at one size
const cache = new PictureCache(
  { create: (b) => URL.createObjectURL(b), revoke: (u) => URL.revokeObjectURL(u) },
  4000
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
let running = 0
const waiting: (() => void)[] = []
async function inTurn<T>(job: () => Promise<T>): Promise<T> {
  if (running >= 2) await new Promise<void>((go) => waiting.push(go))
  else running++
  try {
    await idle()
    return await job()
  } finally {
    // a finished one hands its turn straight on
    const next = waiting.shift()
    if (next) next()
    else running--
  }
}

export const cachedPicture = (key: string): string | undefined => cache.get(key)

export function loadPicture(
  key: string,
  style: NoCover,
  art: PictureArt & { seed: string },
  theme: ThemeName,
  bucket: Bucket
): Promise<string | undefined> {
  return cache.load(key, () =>
    inTurn(() => drawPicture(style, art, theme, pixelsOf(bucket), bucket === 48))
  )
}
