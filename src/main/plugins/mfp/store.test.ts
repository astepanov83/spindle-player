import { describe, expect, it } from 'vitest'
import type { ThemePalettes } from '../../../shared/palette'
import type { MfpEpisode } from './site'
import { isStale, parseMfp, refreshEpisodes, serializeMfp, type MfpData } from './store'

const site = 'https://musicforprogramming.net'

function episode(slug: string, number: number): MfpEpisode {
  return {
    slug,
    number,
    title: `${number}: Artist ${number}`,
    artist: `Artist ${number}`,
    url: `https://datashat.net/${slug}.mp3`,
    bytes: 1000,
    duration: 3600,
    date: '2020-01-01T00:00:00Z',
    tracks: [{ artist: 'A', title: 'T' }],
    link: `${site}/${slug}`
  }
}

function episodePage(slug: string, number: number): string {
  return (
    `<script>__SAPPER__={baseUrl:"",preloaded:[void 0,{entry:{slug:"${slug}",type:"episode",` +
    `order:${number},title:"${number}: Artist ${number}",file:"https:\\u002F\\u002Fdatashat.net\\u002F${slug}.mp3",` +
    `filesize:"1000",duration:"1:00:00",timestamp:"2020-01-01 00:00:00",tracklist:"A - T\\u003Cbr\\u003E"}}]};</script>`
  )
}

const latest =
  '<a href=three>03: Artist 3</a><a href=two>02: Artist 2</a><a href=one>01: Artist 1</a>' +
  '<a href=about>About</a>' +
  episodePage('three', 3)

// A fake site: pages by URL, each asked page is counted.
function fakeSite(pages: Record<string, string>): {
  fetchText: (url: string) => Promise<string>
  asked: string[]
} {
  const asked: string[] = []
  return {
    asked,
    fetchText: async (url) => {
      asked.push(url)
      const p = pages[url]
      if (p === undefined) throw new Error(`${url} answered 404`)
      return p
    }
  }
}

describe('refreshEpisodes', () => {
  it('fetches every episode the first time, newest first', async () => {
    const s = fakeSite({
      [`${site}/latest`]: latest,
      [`${site}/two`]: episodePage('two', 2),
      [`${site}/one`]: episodePage('one', 1)
    })
    const r = await refreshEpisodes({ site, known: [], fetchText: s.fetchText })
    expect(r.episodes.map((e) => e.slug)).toEqual(['three', 'two', 'one'])
    expect(r.failed).toBe(0)
    // the latest episode comes with /latest, so its own page is not asked
    expect(s.asked).not.toContain(`${site}/three`)
  })

  it('fetches only episodes it does not have', async () => {
    const s = fakeSite({ [`${site}/latest`]: latest, [`${site}/one`]: episodePage('one', 1) })
    const r = await refreshEpisodes({
      site,
      known: [episode('two', 2)],
      fetchText: s.fetchText
    })
    expect(r.episodes.map((e) => e.slug)).toEqual(['three', 'two', 'one'])
    expect(s.asked).toEqual([`${site}/latest`, `${site}/one`])
  })

  it('skips an episode that fails and counts it', async () => {
    const s = fakeSite({ [`${site}/latest`]: latest, [`${site}/one`]: episodePage('one', 1) })
    const logged: string[] = []
    const r = await refreshEpisodes({
      site,
      known: [],
      fetchText: s.fetchText,
      log: (t) => logged.push(t)
    })
    expect(r.episodes.map((e) => e.slug)).toEqual(['three', 'one'])
    expect(r.failed).toBe(1)
    expect(logged.join()).toContain('two')
  })

  it('counts a page with no episode data as failed', async () => {
    const s = fakeSite({
      [`${site}/latest`]: latest,
      [`${site}/two`]: '<html>maintenance</html>',
      [`${site}/one`]: episodePage('one', 1)
    })
    const r = await refreshEpisodes({ site, known: [], fetchText: s.fetchText })
    expect(r.failed).toBe(1)
  })

  it('drops episodes the site no longer lists', async () => {
    const s = fakeSite({
      [`${site}/latest`]: latest,
      [`${site}/two`]: episodePage('two', 2),
      [`${site}/one`]: episodePage('one', 1)
    })
    const r = await refreshEpisodes({
      site,
      known: [episode('zero', 0)],
      fetchText: s.fetchText
    })
    expect(r.episodes.map((e) => e.slug)).toEqual(['three', 'two', 'one'])
  })

  it('fails when /latest lists no episodes', async () => {
    const s = fakeSite({ [`${site}/latest`]: '<html></html>' })
    await expect(refreshEpisodes({ site, known: [], fetchText: s.fetchText })).rejects.toThrow(
      /no episodes/
    )
  })

  it('asks 4 pages at a time at most', async () => {
    const slugs = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const list = slugs.map((s, i) => `<a href=${s}>${i + 1}: X</a>`).join('')
    let now = 0
    let most = 0
    const r = await refreshEpisodes({
      site,
      known: [],
      fetchText: async (url) => {
        if (url.endsWith('/latest')) return list
        now++
        most = Math.max(most, now)
        await new Promise((res) => setTimeout(res, 5))
        now--
        const slug = url.slice(url.lastIndexOf('/') + 1)
        return episodePage(slug, slugs.indexOf(slug) + 1)
      }
    })
    expect(r.episodes).toHaveLength(8)
    expect(most).toBe(4)
  })
})

describe('mfp.json', () => {
  const palette: ThemePalettes = {
    dark: ['#111111', '#222222', '#333333'],
    light: ['#444444', '#555555', '#666666']
  }
  const data: MfpData = {
    fetchedAt: 1700000000000,
    cover: { hash: 'a'.repeat(40), palette, v: 3, small: true },
    episodes: [episode('two', 2), episode('one', 1)]
  }

  it('reads back what it wrote', () => {
    expect(parseMfp(JSON.parse(JSON.stringify(serializeMfp(data))))).toEqual(data)
  })

  it('decodes names a file from before kept raw', () => {
    const raw = serializeMfp(data) as { episodes: MfpEpisode[] }
    raw.episodes[0] = {
      ...episode('two', 2),
      artist: 'K&ouml;ln',
      tracks: [{ artist: 'Steinbr&uuml;chel', title: 'K&ouml;ln Concert' }]
    }
    const e = parseMfp(JSON.parse(JSON.stringify(raw))).episodes[0]
    expect([e.artist, e.tracks[0].artist, e.tracks[0].title]).toEqual([
      'Köln',
      'Steinbrüchel',
      'Köln Concert'
    ])
  })

  it('starts empty for a missing, broken or other-version file', () => {
    const empty = { fetchedAt: 0, episodes: [] }
    expect(parseMfp(undefined)).toEqual(empty)
    expect(parseMfp('nonsense')).toEqual(empty)
    expect(parseMfp({ ...(serializeMfp(data) as object), version: 99 })).toEqual(empty)
  })

  it('drops episodes with a bad field and keeps the rest', () => {
    const raw = serializeMfp(data) as { episodes: unknown[] }
    raw.episodes.push({ ...episode('x', 9), url: 'http://plain.net/x.mp3' })
    raw.episodes.push({ ...episode('y', 8), tracks: 'none' })
    raw.episodes.push(null)
    expect(parseMfp(raw).episodes.map((e) => e.slug)).toEqual(['two', 'one'])
  })

  it('drops a cover that is not a hash, or has no colors', () => {
    const read = (cover: unknown): MfpData => parseMfp({ ...(serializeMfp(data) as object), cover })
    expect(read({ ...data.cover, hash: '../x' }).cover).toBeUndefined()
    expect(read({ ...data.cover, palette: undefined }).cover).toBeUndefined()
  })

  it('drops a hash alone, as written before MFP had its own cover: it is fetched again', () => {
    expect(
      parseMfp({ ...(serializeMfp(data) as object), cover: 'a'.repeat(40) }).cover
    ).toBeUndefined()
  })
})

describe('isStale', () => {
  const day = 24 * 3600 * 1000
  it('is stale after a day, or with no episodes', () => {
    const d = { fetchedAt: 10 * day, episodes: [episode('one', 1)] }
    expect(isStale(d, 10 * day + day - 1)).toBe(false)
    expect(isStale(d, 11 * day)).toBe(true)
    expect(isStale({ fetchedAt: 10 * day, episodes: [] }, 10 * day)).toBe(true)
  })
})
