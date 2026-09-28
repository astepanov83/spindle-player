// A made-up picture for a song with no cover: the album's main color running
// into its dark one, as the page's tints do. Only for the media controls.
import type { Palette } from '../../../shared/palette'

// The key the tile is kept under: the same colors give the same tile.
export function tileKey(p: Palette): string {
  return `tile:${p[0]}${p[2]}`
}

export async function paletteTile(p: Palette, size = 256): Promise<Blob> {
  const canvas = new OffscreenCanvas(size, size)
  const x = canvas.getContext('2d')!
  const g = x.createLinearGradient(0, 0, size, size)
  g.addColorStop(0, p[0])
  g.addColorStop(1, p[2])
  x.fillStyle = g
  x.fillRect(0, 0, size, size)
  return canvas.convertToBlob({ type: 'image/png' })
}
