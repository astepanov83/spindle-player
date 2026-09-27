/// <reference lib="dom" />
// Preload of the hidden window that resizes covers for main (see cover-cache.ts).
// It loads no page: Chromium's image decoding is all it needs.
import { ipcRenderer } from 'electron'
import { CoverChannel, type CoverJob, type CoverResult } from '../shared/cover-job'

async function resize(data: Uint8Array, side: number): Promise<Uint8Array | undefined> {
  // decoded off this window's main thread
  const full = await createImageBitmap(new Blob([data as Uint8Array<ArrayBuffer>]))
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
  full.close()
  img.close()
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
  return new Uint8Array(await blob.arrayBuffer())
}

ipcRenderer.on(CoverChannel.job, async (_, job: CoverJob) => {
  let jpg: Uint8Array | undefined
  try {
    jpg = await resize(job.data, job.side)
  } catch {
    // not a picture Chromium can read
  }
  const result: CoverResult = { id: job.id, jpg }
  ipcRenderer.send(CoverChannel.done, result)
})
