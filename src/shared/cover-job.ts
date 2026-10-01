// Messages between main and the hidden window that resizes covers.
import type { ThemePalettes } from './palette'

export const CoverChannel = {
  job: 'cover:job',
  done: 'cover:done'
} as const

export interface CoverJob {
  id: number
  // the source picture (JPEG, PNG, WebP...)
  data: Uint8Array
  // the shorter side of the resized JPEG, in px; left out when only the palette is wanted
  side?: number
  // also pick the album colors from the picture
  palette?: boolean
  // a station logo: its see-through parts are filled (see logoBackdrop)
  backdrop?: boolean
  // 3 more pictures: the JPEG is a 2x2 mosaic of data and these, side px a
  // side, each cropped to a square (an artist's tile)
  more?: Uint8Array[]
}

export interface CoverResult {
  id: number
  // JPEG bytes
  jpg?: Uint8Array
  palette?: ThemePalettes
  // the source picture's size in px
  width?: number
  height?: number
  // set when the picture itself could not be decoded
  bad?: boolean
}
