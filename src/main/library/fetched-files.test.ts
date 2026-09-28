import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { listSources, pruneSources, readSource, saveSource } from './fetched-files'

const a = 'a'.repeat(40)
const b = 'b'.repeat(40)
let dir: string
afterEach(() => rmSync(dir, { recursive: true, force: true }))
const fresh = (): string => (dir = mkdtempSync(join(tmpdir(), 'fetched-')))

describe('fetched cover sources', () => {
  it('keeps the downloaded bytes, so the large cover can be made later', async () => {
    const d = join(fresh(), 'fetched-covers')
    await saveSource(d, a, new Uint8Array([1, 2, 3]))
    expect(await readSource(d, a)).toEqual(new Uint8Array([1, 2, 3]))
    expect(await listSources(d)).toEqual(new Set([a]))
  })

  it('lists nothing for a folder that is not there yet', async () => {
    expect(await listSources(join(fresh(), 'none'))).toEqual(new Set())
  })

  it('deletes the ones no result points at, and stray files', async () => {
    const d = fresh()
    await saveSource(d, a, new Uint8Array([1]))
    await saveSource(d, b, new Uint8Array([2]))
    writeFileSync(join(d, 'junk.txt'), 'x')
    await pruneSources(d, (h) => h === a)
    expect(readdirSync(d)).toEqual([`${a}.img`])
  })
})
