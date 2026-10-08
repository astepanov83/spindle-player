// Draws a made picture for an item with no cover (ticket 103): the style the
// setting picks, in the item's colors for the theme, to a PNG.
import type { PictureArt } from '../../../shared/library'
import { fallbackPalettes } from '../../../shared/palette'
import type { NoCover } from '../../../shared/settings'
import type { ThemeName } from '../../../shared/theme'
import { inksOf } from './colors'
import { hashOf, type Draw } from './drawing'
import { drawRecord } from './record'
import { drawArtistRings, drawArtistType } from './artist'
import { drawGenre } from './genre-art'
import { drawRings } from './rings'
import { artistFont, drawType, titleFont } from './type'

// 'sound' comes with ticket 107; until then it draws as the default.
const styles: Partial<Record<NoCover, Draw>> = {
  record: drawRecord,
  rings: drawRings,
  type: drawType,
  genre: drawGenre
}
export const drawOf = (style: NoCover): Draw => styles[style] ?? drawRings

// An artist's version of each style (ticket 105): their initials. Record is
// the grey record, drawn by Cover. Genre is the same drawing, in a circle.
// Sound adds its own with 107.
const artistStyles: Partial<Record<NoCover, Draw>> = {
  rings: drawArtistRings,
  type: drawArtistType,
  genre: drawGenre
}
export const drawArtistOf = (style: NoCover): Draw => artistStyles[style] ?? drawArtistRings

// The canvas draws text in the page's fonts only once they are in; the
// font's parts for Cyrillic or other scripts load on demand.
async function fontsFor(text: string): Promise<void> {
  const fonts = (globalThis as { document?: Document }).document?.fonts
  if (!fonts) return
  await fonts.ready
  await Promise.all([fonts.load(titleFont(10), text), fonts.load(artistFont(10), text)])
}

export async function drawPicture(
  style: NoCover,
  art: PictureArt & { seed: string },
  theme: ThemeName,
  px: number,
  small: boolean,
  forArtist = false
): Promise<Blob> {
  const title = art.title ?? ''
  const artist = art.artist ?? ''
  if (forArtist || style === 'type') await fontsFor(title + artist)
  const canvas = new OffscreenCanvas(px, px)
  const x = canvas.getContext('2d')!
  x.scale(px / 100, px / 100)
  const draw = forArtist ? drawArtistOf(style) : drawOf(style)
  draw(x, {
    inks: inksOf(art.palette ?? fallbackPalettes(art.seed), theme),
    hash: hashOf(art.seed),
    lengths: art.lengths ?? [],
    title,
    artist,
    genre: art.genre,
    small,
    round: forArtist
  })
  return canvas.convertToBlob({ type: 'image/png' })
}
