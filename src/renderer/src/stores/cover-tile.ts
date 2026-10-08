// The picture the media controls get for a song with no cover: the same made
// picture the app shows (ticket 103), drawn bigger. Art with no seed gets the
// album's main color running into its dark one, as the page's tints do.
import type { PictureArt } from '../../../shared/library'
import type { NoCover } from '../../../shared/settings'
import type { ThemeName } from '../../../shared/theme'
import { drawPicture } from '../no-cover/draw'

type TileArt = PictureArt & Required<Pick<PictureArt, 'palette'>>

// The key the tile is kept under: the same picture gives the same tile.
export function tileKey(art: TileArt, style: NoCover, theme: ThemeName): string {
  const p = art.palette[theme]
  return art.seed ? `tile:${style}|${theme}|${art.seed}` : `tile:${p[0]}${p[2]}`
}

export async function paletteTile(
  art: TileArt,
  style: NoCover,
  theme: ThemeName,
  size = 256
): Promise<Blob> {
  if (art.seed) return drawPicture(style, { ...art, seed: art.seed }, theme, size, false)
  const p = art.palette[theme]
  const canvas = new OffscreenCanvas(size, size)
  const x = canvas.getContext('2d')!
  const g = x.createLinearGradient(0, 0, size, size)
  g.addColorStop(0, p[0])
  g.addColorStop(1, p[2])
  x.fillStyle = g
  x.fillRect(0, 0, size, size)
  return canvas.convertToBlob({ type: 'image/png' })
}
