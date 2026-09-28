import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { text } from 'stream/consumers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openMedia } from './media-file'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'spindle-media-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('openMedia', () => {
  it('reads the range asked for', async () => {
    const p = join(dir, 'a.mp3')
    writeFileSync(p, '0123456789')
    const f = await openMedia(p)
    expect(f?.size).toBe(10)
    expect(await text(f!.stream(2, 5))).toBe('2345')
    // the stream closed the file; this must do nothing
    f!.close()
  })

  it('still reads a file deleted after it was opened', async () => {
    const p = join(dir, 'a.mp3')
    writeFileSync(p, 'abc')
    const f = await openMedia(p)
    rmSync(p)
    expect(await text(f!.stream(0, 2))).toBe('abc')
  })

  it('gives nothing for a file that is gone', async () => {
    expect(await openMedia(join(dir, 'gone.mp3'))).toBeUndefined()
  })

  it('gives nothing for a folder', async () => {
    expect(await openMedia(dir)).toBeUndefined()
  })

  it.skipIf(process.getuid?.() === 0)('gives nothing for a file it may not read', async () => {
    const p = join(dir, 'locked.mp3')
    writeFileSync(p, 'abc')
    chmodSync(p, 0)
    expect(await openMedia(p)).toBeUndefined()
  })

  it('closes a file no stream took over', async () => {
    const p = join(dir, 'a.mp3')
    writeFileSync(p, 'abc')
    const f = await openMedia(p)
    f!.close()
    // a second close (the answer ended both ways) must not throw
    expect(() => f!.close()).not.toThrow()
  })
})
