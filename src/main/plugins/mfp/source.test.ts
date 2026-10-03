import { describe, expect, it } from 'vitest'
import type { MfpStatus } from '../../../shared/plugins/mfp/mfp'
import { defaultPalettes, fallbackPalettes } from '../../../shared/palette'
import type { MadeCover } from '../../covers/covers'
import type { MfpEpisode } from './site'
import { MfpSource, type MfpSourceOptions } from './source'
import { serializeMfp, staleMs } from './store'

const site = 'https://musicforprogramming.net'
const pic = new Uint8Array([1, 2, 3])
const made: MadeCover = { hash: 'f'.repeat(40), palette: defaultPalettes, v: 2 }

function episode(slug: string, number: number): MfpEpisode {
  return {
    slug,
    number,
    title: `${number}: X`,
    artist: 'X',
    url: `https://datashat.net/${slug}.mp3`,
    bytes: 1,
    duration: 60,
    date: null,
    tracks: [],
    link: `${site}/${slug}`
  }
}

const page = (slug: string, n: number): string =>
  `<a href=${slug}>${n}: X</a><script>__SAPPER__={baseUrl:"",preloaded:[void 0,{entry:{slug:"${slug}",` +
  `type:"episode",order:${n},title:"${n}: X",file:"https:\\u002F\\u002Fdatashat.net\\u002F${slug}.mp3",` +
  `filesize:"1",duration:"1:00"}}]};</script>`

// A source with fakes around it, and what it did.
function setup(
  over: Partial<MfpSourceOptions> = {},
  file?: unknown
): {
  src: MfpSource
  saved: unknown[]
  statuses: (MfpStatus | undefined)[]
  changes: number[]
  asked: string[]
  time: { now: number }
} {
  const saved: unknown[] = []
  const statuses: (MfpStatus | undefined)[] = []
  const changes: number[] = []
  const asked: string[] = []
  const time = { now: 10 * staleMs }
  const cached = new Set<string>()
  const src = new MfpSource({
    site,
    read: () => file,
    save: (d) => saved.push(d),
    fetchText: async (url) => {
      asked.push(url)
      if (url === `${site}/latest`) return page('one', 1)
      throw new Error('404')
    },
    fetchBytes: async (url) => {
      asked.push(url)
      return pic
    },
    addCover: async () => {
      cached.add(made.hash)
      return made
    },
    hasCover: async (c) => cached.has(c.hash),
    recolor: async (c) => c,
    now: () => time.now,
    changed: () => changes.push(time.now),
    status: (s) => statuses.push(s),
    log: () => {},
    ...over
  })
  src.load()
  return { src, saved, statuses, changes, asked, time }
}

const fresh = serializeMfp({
  fetchedAt: 10 * staleMs - 1000,
  cover: made,
  episodes: [episode('one', 1)]
})

describe('MfpSource', () => {
  it('has the episodes of mfp.json while off, and asks for nothing', async () => {
    const s = setup({}, fresh)
    expect(s.src.episodes.map((e) => e.slug)).toEqual(['one'])
    expect(s.src.cover).toEqual(made)
    await s.src.setOn(false)
    await s.src.refresh(true)
    expect(s.asked).toEqual([])
    expect(s.statuses).toEqual([])
  })

  it('turned on, reads the site, gets the picture, saves, and says so', async () => {
    const s = setup()
    await s.src.setOn(true)
    expect(s.src.episodes.map((e) => e.slug)).toEqual(['one'])
    expect(s.src.cover).toEqual(made)
    expect(s.asked).toEqual([`${site}/latest`, `${site}/img/folder.jpg`])
    expect(s.saved).toHaveLength(1)
    expect(s.changes).toHaveLength(1)
    expect(s.statuses.at(-1)).toEqual({ episodes: 1, fetchedAt: s.time.now, running: false })
  })

  it('turned on with a fresh file and its picture, makes no request and changes nothing', async () => {
    const s = setup({ hasCover: async () => true }, fresh)
    await s.src.setOn(true)
    expect(s.asked).toEqual([])
    expect(s.changes).toEqual([])
    expect(s.saved).toEqual([])
    expect(s.statuses).toEqual([{ episodes: 1, fetchedAt: 10 * staleMs - 1000, running: false }])
  })

  it('reads a fresh file again only when forced', async () => {
    const s = setup({ hasCover: async () => true }, fresh)
    await s.src.setOn(true)
    await s.src.refresh(false)
    expect(s.asked).toEqual([])
    await s.src.refresh(true)
    expect(s.asked).toEqual([`${site}/latest`])
  })

  it('with a fresh file but no cached picture, gets only the picture', async () => {
    const s = setup({}, fresh)
    await s.src.setOn(true)
    expect(s.asked).toEqual([`${site}/img/folder.jpg`])
  })

  it('picks the colors again when an older paletteVersion picked them, with no request', async () => {
    const colors = fallbackPalettes('new')
    const s = setup(
      { hasCover: async () => true, recolor: async (c) => ({ ...c, palette: colors, v: 9 }) },
      fresh
    )
    await s.src.setOn(true)
    expect(s.asked).toEqual([])
    expect(s.src.cover).toEqual({ ...made, palette: colors, v: 9 })
    expect(s.saved).toHaveLength(1)
    expect(s.changes).toHaveLength(1)
  })

  it('keeps the old episodes and shows the error when the site fails', async () => {
    const s = setup(
      {
        fetchText: async () => {
          throw new Error('getaddrinfo ENOTFOUND')
        }
      },
      serializeMfp({ fetchedAt: 1, episodes: [episode('one', 1)] })
    )
    await s.src.setOn(true)
    expect(s.src.episodes).toHaveLength(1)
    expect(s.saved).toEqual([])
    expect(s.statuses.at(-1)).toMatchObject({
      running: false,
      error: 'getaddrinfo ENOTFOUND',
      fetchedAt: 1
    })
  })

  it('shows the status while it runs', async () => {
    let seen: MfpStatus | undefined
    const s = setup({
      fetchText: async () => {
        seen = s.statuses.at(-1)
        return page('one', 1)
      }
    })
    await s.src.setOn(true)
    expect(seen).toMatchObject({ running: true })
  })

  it('runs one refresh at a time', async () => {
    const s = setup()
    await Promise.all([s.src.setOn(true), s.src.refresh(true), s.src.refresh(true)])
    expect(s.asked.filter((u) => u.endsWith('/latest'))).toHaveLength(1)
  })

  it('gets the picture again when it is no longer cached', async () => {
    const gone: MadeCover = { ...made, hash: 'a'.repeat(40) }
    const s = setup({}, serializeMfp({ fetchedAt: 1, cover: gone, episodes: [episode('one', 1)] }))
    await s.src.setOn(true)
    expect(s.src.cover).toEqual(made)
  })

  it('goes on without a picture that fails, and tries again next time', async () => {
    let fail = true
    const s = setup({
      fetchBytes: async () => {
        if (fail) throw new Error('timeout')
        return pic
      }
    })
    await s.src.setOn(true)
    expect(s.src.episodes).toHaveLength(1)
    expect(s.src.cover).toBeUndefined()
    fail = false
    await s.src.refresh(true)
    expect(s.src.cover).toEqual(made)
  })

  it('goes on without a picture the cover cache could not make', async () => {
    const s = setup({ addCover: async () => undefined })
    await s.src.setOn(true)
    expect(s.src.episodes).toHaveLength(1)
    expect(s.src.cover).toBeUndefined()
  })

  it('turned off, clears the status and keeps the episodes', async () => {
    const s = setup()
    await s.src.setOn(true)
    const before = s.changes.length
    await s.src.setOn(false)
    expect(s.src.episodes).toHaveLength(1)
    expect(s.statuses.at(-1)).toBeUndefined()
    expect(s.changes.length).toBe(before)
  })

  it('turned off while reading, keeps and writes nothing the read brings', async () => {
    let release: () => void = () => {}
    const s = setup({
      fetchText: () => new Promise((r) => (release = () => r(page('one', 1))))
    })
    const on = s.src.setOn(true)
    await new Promise((r) => setTimeout(r, 0))
    await s.src.setOn(false)
    release()
    await on
    expect(s.src.episodes).toEqual([])
    expect(s.saved).toEqual([])
    expect(s.changes).toEqual([])
    expect(s.asked).not.toContain(`${site}/img/folder.jpg`)
    expect(s.statuses.at(-1)).toBeUndefined()
  })
})
