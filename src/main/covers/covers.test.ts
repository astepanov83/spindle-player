// The core's cover service: the cache is there with no plugin's help, and
// the song lookup and the large size come from a helper when one is given.
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ protocol: {} }))

const { Covers } = await import('./covers')
const { coverRoute } = await import('../protocol')
type Cache = ConstructorParameters<typeof Covers>[0]

const hash = 'a'.repeat(40)

function setup(): { covers: InstanceType<typeof Covers>; dir: string; large: string[] } {
  const dir = mkdtempSync(join(tmpdir(), 'spindle-covers-'))
  const large: string[] = []
  const cache = {
    smallPath: (h: string) => join(dir, `${h}.jpg`),
    large: async (h: string, source: () => Promise<Uint8Array | undefined>) => {
      const data = await source()
      if (!data) return undefined
      large.push(h)
      const path = join(dir, `${h}-large.jpg`)
      writeFileSync(path, data)
      return path
    },
    mosaic: async () => undefined
  } as unknown as Cache
  return { covers: new Covers(cache), dir, large }
}

const ask = (route: ReturnType<typeof coverRoute>, path: string): Promise<Response> => {
  const url = new URL(`spindle://cover/${path}`)
  return Promise.resolve(route(new Request(url), url, url.pathname.split('/').filter(Boolean)))
}

describe('Covers', () => {
  it('answers with no helper: a song cover later, no large picture', async () => {
    const { covers, dir } = setup()
    expect(await covers.get().song({ artist: 'a', song: 's' }, new AbortController().signal)).toBe(
      'later'
    )
    expect(await covers.source(hash)).toBeUndefined()
    expect(() => covers.kept()).not.toThrow()
    writeFileSync(join(dir, `${hash}.jpg`), 'small')
    const route = coverRoute(covers)
    expect((await ask(route, `small/${hash}`)).status).toBe(200)
    expect((await ask(route, `large/${hash}`)).status).toBe(404)
  })

  it('asks the helper for song covers, the kept list and the source picture', async () => {
    const { covers, large } = setup()
    const kept = vi.fn()
    covers.provide({
      song: async () => new Uint8Array([1]),
      kept,
      source: async (h) => (h === hash ? new Uint8Array([9]) : undefined)
    })
    expect(
      await covers.get().song({ artist: 'a', song: 's' }, new AbortController().signal)
    ).toEqual(new Uint8Array([1]))
    covers.get().kept()
    expect(kept).toHaveBeenCalledOnce()
    const res = await ask(coverRoute(covers), `large/${hash}`)
    expect(res.status).toBe(200)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([9]))
    expect(large).toEqual([hash])
  })

  it('refuses a name that is no cover hash', async () => {
    const route = coverRoute(setup().covers)
    expect((await ask(route, 'small/../x')).status).toBe(404)
    expect((await ask(route, 'small')).status).toBe(404)
    expect((await ask(route, 'mosaic/a-b')).status).toBe(404)
  })
})
