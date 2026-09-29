// An audio file opened for spindle://media. It is opened before the answer
// starts, so a file that is gone or can't be read (EACCES) gets a 404. Opened
// only after the answer, it made a 200 whose stream then failed.
import { open, type FileHandle } from 'fs/promises'
import type { Readable } from 'stream'

export interface MediaFile {
  size: number
  // the device (st_dev), so the scan knows which disk the audio comes from
  dev: number
  // changes when the file does
  version: string
  // Reads bytes start..end (both included). Takes over the file: the stream closes it.
  stream(start: number, end: number): Readable
  // Closes the file if no stream took it over. Safe to call more than once.
  close(): void
}

export async function openMedia(path: string): Promise<MediaFile | undefined> {
  let fh: FileHandle | undefined
  try {
    fh = await open(path, 'r')
    const s = await fh.stat()
    if (!s.isFile()) throw new Error('not a file')
    const file = fh
    let owned = true
    return {
      size: s.size,
      dev: s.dev,
      version: `${s.mtimeMs}:${s.size}`,
      stream: (start, end) => {
        owned = false
        return file.createReadStream({ start, end, autoClose: true })
      },
      close: () => {
        if (!owned) return
        owned = false
        void file.close().catch(() => {})
      }
    }
  } catch (e) {
    // the page only sees a 404, so say why here
    console.error(`Could not open ${path}: ${(e as Error).message}`)
    await fh?.close().catch(() => {})
    return undefined
  }
}
