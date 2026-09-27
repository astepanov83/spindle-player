// Messages between main and the hidden window that resizes covers.
export const CoverChannel = {
  job: 'cover:job',
  done: 'cover:done'
} as const

export interface CoverJob {
  id: number
  // the source picture (JPEG, PNG, WebP...)
  data: Uint8Array
  // the shorter side of the result, in px
  side: number
}

export interface CoverResult {
  id: number
  // JPEG bytes
  jpg?: Uint8Array
  // set when the picture itself could not be decoded
  bad?: boolean
}
