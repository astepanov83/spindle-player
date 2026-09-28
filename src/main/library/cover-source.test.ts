import { hash } from 'crypto'
import { describe, expect, it } from 'vitest'
import { pictureWithHash } from './cover-source'

const pic = (s: string): Uint8Array => new TextEncoder().encode(s)
const h = hash('sha1', pic('old'))

describe('pictureWithHash', () => {
  it('skips a file whose picture changed since the scan', async () => {
    const got = await pictureWithHash(h, [async () => pic('new'), async () => pic('old')])
    expect(got).toEqual(pic('old'))
  })

  it('skips files that fail or have no picture', async () => {
    const got = await pictureWithHash(h, [
      async () => {
        throw new Error('ENOENT')
      },
      async () => undefined,
      async () => pic('old')
    ])
    expect(got).toEqual(pic('old'))
  })

  it('gives nothing when no file has the picture any more', async () => {
    expect(await pictureWithHash(h, [async () => pic('new')])).toBeUndefined()
  })

  it('reads no further than the first match', async () => {
    let reads = 0
    const read = async (): Promise<Uint8Array> => (reads++, pic('old'))
    await pictureWithHash(h, [read, read, read])
    expect(reads).toBe(1)
  })
})
