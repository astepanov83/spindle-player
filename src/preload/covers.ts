/// <reference lib="dom" />
// Preload of the hidden window that resizes covers for main (see cover-cache.ts).
// It loads no page: Chromium's image decoding is all it needs. It also picks
// the album colors, since the decoded pixels are here already.
import { ipcRenderer } from 'electron'
import { CoverChannel, type CoverJob, type CoverResult } from '../shared/cover-job'
import { coverPalettes, type ThemePalettes } from '../shared/palette'

// Colors are picked from a sample this big; more pixels change nothing.
const sampleSide = 64

async function resize(full: ImageBitmap, side: number): Promise<Uint8Array> {
  const scale = Math.min(1, side / Math.min(full.width, full.height))
  const width = Math.max(1, Math.round(full.width * scale))
  const height = Math.max(1, Math.round(full.height * scale))
  const img =
    scale < 1
      ? await createImageBitmap(full, {
          resizeWidth: width,
          resizeHeight: height,
          resizeQuality: 'high'
        })
      : full
  const canvas = new OffscreenCanvas(width, height)
  canvas.getContext('2d')!.drawImage(img, 0, 0)
  if (img !== full) img.close()
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
  return new Uint8Array(await blob.arrayBuffer())
}

async function palette(full: ImageBitmap): Promise<ThemePalettes> {
  const img = await createImageBitmap(full, {
    resizeWidth: sampleSide,
    resizeHeight: sampleSide,
    resizeQuality: 'medium'
  })
  const ctx = new OffscreenCanvas(sampleSide, sampleSide).getContext('2d', {
    willReadFrequently: true
  })!
  ctx.drawImage(img, 0, 0)
  img.close()
  return coverPalettes(ctx.getImageData(0, 0, sampleSide, sampleSide).data)
}

async function run(job: CoverJob): Promise<CoverResult> {
  let full: ImageBitmap
  try {
    // decoded off this window's main thread
    full = await createImageBitmap(new Blob([job.data as Uint8Array<ArrayBuffer>]))
  } catch {
    // not a picture Chromium can read
    return { id: job.id, bad: true }
  }
  try {
    const result: CoverResult = { id: job.id }
    if (job.side) result.jpg = await resize(full, job.side)
    if (job.palette)
      try {
        result.palette = await palette(full)
      } catch {
        // keep the JPEG; the next scan picks the palette from the small cover
      }
    return result
  } finally {
    full.close()
  }
}

ipcRenderer.on(CoverChannel.job, async (_, job: CoverJob) => {
  let result: CoverResult
  try {
    result = await run(job)
  } catch {
    // decoded, but resizing or encoding failed: nothing is known, so no "bad" marker
    result = { id: job.id }
  }
  ipcRenderer.send(CoverChannel.done, result)
})
