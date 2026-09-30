import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { parseStation } from '../../shared/stations'
import {
  groupStations,
  mergeResults,
  nameKey,
  stationName,
  RadioBrowser,
  resolveMirrors,
  searchPath,
  usableRecords,
  type RbRecord
} from './radio-browser'

// A real answer for "drone" (September 2026), trimmed to the fields read.
const read = (name: string): RbRecord[] =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'))
const byName = read('rb-drone-name.json')
const byTag = read('rb-drone-tag.json')

const record = (over: Partial<RbRecord>): RbRecord => ({
  stationuuid: 'aaaaaaaa-0000-0000-0000-000000000001',
  name: 'Radio X',
  url: 'http://x.example/stream',
  url_resolved: 'http://x.example/stream',
  homepage: 'https://radiox.example/',
  favicon: '',
  tags: 'rock',
  countrycode: 'GB',
  codec: 'MP3',
  bitrate: 128,
  hls: 0,
  lastcheckok: 1,
  votes: 10,
  ...over
})

describe('nameKey', () => {
  it('takes out bitrate and codec words', () => {
    expect(nameKey('Radio X 128k')).toBe('radio x')
    expect(nameKey('Radio X (AAC)')).toBe('radio x')
    expect(nameKey('Radio X HQ')).toBe('radio x')
    expect(nameKey('Radio X - mp3 320 kbps')).toBe('radio x')
    expect(nameKey('SomaFM Drone Zone 2 (128k AAC) ')).toBe('somafm drone zone 2')
  })

  it('keeps words that only start like one', () => {
    expect(nameKey('Oggy Radio')).toBe('oggy radio')
    expect(nameKey('128 Beats')).toBe('128 beats')
  })

  it('keeps a name made only of such words', () => {
    expect(nameKey('MP3')).toBe('mp3')
  })
})

describe('stationName', () => {
  it('drops brackets that only name the stream: the row lists the bitrates', () => {
    expect(stationName('SomaFM Drone Zone (128k MP3)')).toBe('SomaFM Drone Zone')
    expect(stationName('Radio X [AAC+ 64 kbps] ')).toBe('Radio X')
    expect(stationName('Drone Radio (MRG.fm)')).toBe('Drone Radio (MRG.fm)')
    expect(stationName('Radio X 128k')).toBe('Radio X 128k')
    expect(stationName('(MP3)')).toBe('(MP3)')
  })
})

describe('usableRecords', () => {
  it('drops HLS, failed checks, non-web addresses and records with no id or name', () => {
    const list = usableRecords([
      record({ stationuuid: 'a1', name: 'Good' }),
      record({ stationuuid: 'a2', hls: 1 }),
      record({ stationuuid: 'a3', lastcheckok: 0 }),
      record({ stationuuid: 'a4', url: 'rtmp://x', url_resolved: 'rtmp://x' }),
      record({ stationuuid: '', name: 'No id' }),
      record({ stationuuid: 'a6', name: '  ' }),
      'junk',
      null
    ])
    expect(list.map((r) => r.stationuuid)).toEqual(['a1'])
  })

  it('takes the address as given when there is no resolved one', () => {
    const [r] = usableRecords([record({ url_resolved: '', url: 'https://y.example/live' })])
    expect(r.url_resolved).toBe('https://y.example/live')
  })

  it('takes anything that is not a list as none', () => {
    expect(usableRecords({ error: 'x' })).toEqual([])
  })
})

describe('mergeResults', () => {
  it('puts name matches first and drops the tag matches seen already', () => {
    const merged = mergeResults(byName, byTag)
    expect(merged.slice(0, byName.length)).toEqual(byName)
    const ids = merged.map((r) => r.stationuuid)
    expect(new Set(ids).size).toBe(ids.length)
    // 11 by name, 23 by tag, 7 of them in both
    expect(merged).toHaveLength(27)
  })
})

describe('groupStations', () => {
  it('joins "Radio X 128k" and "Radio X (AAC)" on the same host', () => {
    const [s, ...rest] = groupStations([
      record({ stationuuid: 'a1', name: 'Radio X 128k', url_resolved: 'http://x.example/128' }),
      record({
        stationuuid: 'a2',
        name: 'Radio X (AAC)',
        url_resolved: 'http://x.example/aac',
        codec: 'AAC+',
        bitrate: 64,
        homepage: 'https://www.radiox.example/listen'
      })
    ])
    expect(rest).toEqual([])
    expect(s.id).toBe('rb-a1')
    expect(s.name).toBe('Radio X 128k')
    expect(s.streams).toEqual([
      { url: 'http://x.example/128', bitrate: 128, codec: 'mp3' },
      { url: 'http://x.example/aac', bitrate: 64, codec: 'aac' }
    ])
  })

  it('keeps the same name on another host apart', () => {
    const list = groupStations([
      record({ stationuuid: 'a1' }),
      record({ stationuuid: 'a2', homepage: 'https://other.example/' })
    ])
    expect(list.map((s) => s.id)).toEqual(['rb-a1', 'rb-a2'])
  })

  it('uses the stream host when there is no homepage', () => {
    const list = groupStations([
      record({ stationuuid: 'a1', homepage: '', url_resolved: 'http://s1.example/a' }),
      record({ stationuuid: 'a2', homepage: '', url_resolved: 'http://s1.example:8000/b' }),
      record({ stationuuid: 'a3', homepage: '', url_resolved: 'http://s2.example/a' })
    ])
    expect(list.map((s) => s.id)).toEqual(['rb-a1', 'rb-a3'])
    expect(list[0].streams.map((x) => x.url)).toEqual([
      'http://s1.example/a',
      'http://s1.example:8000/b'
    ])
  })

  it('lists a stream two records share once, and no bitrate for 0', () => {
    const [s] = groupStations([
      record({ stationuuid: 'a1', bitrate: 0, codec: 'UNKNOWN' }),
      record({ stationuuid: 'a2', name: 'Radio X HQ' })
    ])
    expect(s.streams).toEqual([{ url: 'http://x.example/stream' }])
  })

  it('reads the station from its best voted record', () => {
    const [s] = groupStations([
      record({
        stationuuid: 'a1',
        tags: 'rock, indie,,rock',
        countrycode: 'gb',
        favicon: 'ftp://x/logo.png'
      }),
      record({ stationuuid: 'a2', name: 'Radio X HQ', favicon: 'https://radiox.example/l.png' })
    ])
    expect(s).toEqual({
      id: 'rb-a1',
      name: 'Radio X',
      site: 'https://radiox.example/',
      tags: ['rock', 'indie'],
      country: 'GB',
      // the first web address of a logo in the group
      logoUrl: 'https://radiox.example/l.png',
      streams: [{ url: 'http://x.example/stream', bitrate: 128, codec: 'mp3' }]
    })
  })

  it('keeps the same id when the order of the records changes', () => {
    const a = record({ stationuuid: 'b2', name: 'Radio X 128k', votes: 50 })
    const b = record({
      stationuuid: 'a9',
      name: 'Radio X (AAC)',
      url_resolved: 'http://x.example/aac',
      votes: 10
    })
    const once = groupStations([a, b])
    // the next search: other votes, or the best voted record failed its last check
    const again = groupStations([b, a])
    const alone = groupStations([b])
    expect(once[0].id).toBe('rb-a9')
    expect(again[0].id).toBe('rb-a9')
    expect(alone[0].id).toBe('rb-a9')
  })

  it('takes the id main knows already (a saved or played station)', () => {
    const list = groupStations(
      [
        record({ stationuuid: 'a1' }),
        record({ stationuuid: 'b2', name: 'Radio X HQ', url_resolved: 'http://x.example/hq' })
      ],
      (id) => id === 'rb-b2'
    )
    expect(list.map((s) => s.id)).toEqual(['rb-b2'])
    // the rest still comes from the best voted record
    expect(list[0].name).toBe('Radio X')
  })

  it('groups the saved answer: SomaFM Drone Zone is one station with four streams', () => {
    const list = groupStations(mergeResults(usableRecords(byName), usableRecords(byTag)))
    const zone = list.find((s) => s.name === 'SomaFM Drone Zone')!
    expect(zone.id).toBe('rb-960eb2e9-0601-11e8-ae97-52543be04c81')
    expect(zone.streams.map((s) => `${s.bitrate} ${s.codec}`)).toEqual([
      '128 mp3',
      '64 aac',
      '32 aac',
      '256 mp3'
    ])
    // "Drone Zone 2" is another station
    expect(list.some((s) => s.name === 'SomaFM Drone Zone 2')).toBe(true)
    // best voted first, name matches before tag matches
    expect(list[0]).toBe(zone)
    expect(list.map((s) => s.name).indexOf('Slow Focus | NTS')).toBeGreaterThan(
      list.map((s) => s.name).indexOf('RadCap - Drone Metal')
    )
    // every station passes the check main runs on radio:play and radio:save
    for (const s of list) expect(parseStation(s)).toEqual(s)
  })
})

describe('searchPath', () => {
  it('asks for the best voted working stations', () => {
    expect(searchPath('name', 'drone & bass')).toBe(
      '/json/stations/search?name=drone+%26+bass&hidebroken=true&order=votes&reverse=true&limit=100'
    )
    expect(searchPath('tag', 'drone')).toContain('?tag=drone&')
  })
})

interface Reply {
  status?: number
  body?: unknown
}

// A fake fetch: the answer for each url, or a network error for one not listed.
function fakeFetch(replies: Record<string, Reply>): typeof fetch & {
  calls: { url: string; agent: string | null }[]
} {
  const calls: { url: string; agent: string | null }[] = []
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, agent: new Headers(init?.headers).get('User-Agent') })
    const r = replies[url]
    if (!r) throw new TypeError('fetch failed')
    const code = r.status ?? 200
    return {
      ok: code >= 200 && code < 300,
      status: code,
      json: async () => r.body
    } as Response
  }) as typeof fetch & { calls: { url: string; agent: string | null }[] }
  fn.calls = calls
  return fn
}

const nameUrl = (host: string, q = 'drone'): string => `https://${host}${searchPath('name', q)}`
const tagUrl = (host: string, q = 'drone'): string => `https://${host}${searchPath('tag', q)}`

function browser(
  replies: Record<string, Reply>,
  mirrors: () => Promise<string[]> = async () => ['a.example', 'b.example']
): { rb: RadioBrowser; f: ReturnType<typeof fakeFetch>; mirrors: typeof mirrors } {
  const f = fakeFetch(replies)
  const find = vi.fn(mirrors)
  const rb = new RadioBrowser({ fetch: f, mirrors: find, userAgent: 'Spindle/1.0', log: () => {} })
  return { rb, f, mirrors: find }
}

describe('RadioBrowser.search', () => {
  it('asks by name and by tag, with its User-Agent, and groups the answer', async () => {
    const { rb, f } = browser({
      [nameUrl('a.example')]: { body: byName },
      [tagUrl('a.example')]: { body: byTag }
    })
    const r = await rb.search('drone')
    expect(r.ok && r.stations.length).toBeGreaterThan(10)
    expect(f.calls.every((c) => c.agent === 'Spindle/1.0')).toBe(true)
  })

  it('tries the next mirror when one fails, and keeps it for the run', async () => {
    const { rb, f, mirrors } = browser({
      [nameUrl('a.example')]: { status: 503 },
      [nameUrl('b.example')]: { body: byName },
      [tagUrl('b.example')]: { body: byTag },
      [nameUrl('b.example', 'ambient')]: { body: [] },
      [tagUrl('b.example', 'ambient')]: { body: [] }
    })
    const r = await rb.search('drone')
    expect(r.ok && r.stations.length).toBeGreaterThan(10)
    f.calls.length = 0
    await rb.search('ambient')
    expect(f.calls.map((c) => new URL(c.url).host)).toEqual(['b.example', 'b.example'])
    expect(mirrors).toHaveBeenCalledTimes(1)
  })

  it('says it cannot reach Radio Browser when every mirror fails, and looks them up again next time', async () => {
    const { rb, mirrors } = browser({})
    expect(await rb.search('drone')).toEqual({ ok: false })
    expect(await rb.search('drone')).toEqual({ ok: false })
    expect(mirrors).toHaveBeenCalledTimes(2)
  })

  it('says it cannot reach Radio Browser when the lookup finds no mirror', async () => {
    const { rb } = browser({}, async () => {
      throw new Error('getaddrinfo EAI_AGAIN')
    })
    expect(await rb.search('drone')).toEqual({ ok: false })
  })

  it('shows what one request found when the other failed on every mirror', async () => {
    const { rb } = browser({ [tagUrl('b.example')]: { body: byTag } })
    const r = await rb.search('drone')
    expect(r.ok && r.stations.length).toBeGreaterThan(5)
  })

  it('gives a known station its own id', async () => {
    const f = fakeFetch({
      [nameUrl('a.example')]: { body: byName },
      [tagUrl('a.example')]: { body: byTag }
    })
    const rb = new RadioBrowser({
      fetch: f,
      mirrors: async () => ['a.example'],
      userAgent: 'Spindle/1.0',
      log: () => {},
      known: (id) => id === 'rb-ae7aeb65-5a30-4848-8059-91b2bc2dcfd9'
    })
    const r = await rb.search('drone')
    const zone = r.ok ? r.stations.find((s) => s.name === 'SomaFM Drone Zone') : undefined
    expect(zone?.id).toBe('rb-ae7aeb65-5a30-4848-8059-91b2bc2dcfd9')
  })

  it('sends nothing for a blank search', async () => {
    const { rb, f } = browser({})
    expect(await rb.search('  ')).toEqual({ ok: true, stations: [] })
    expect(f.calls).toEqual([])
  })
})

describe('RadioBrowser clicks', () => {
  const clickUrl = (host: string, uuid: string): string => `https://${host}/json/url/${uuid}`

  async function searched(): Promise<{
    rb: RadioBrowser
    f: ReturnType<typeof fakeFetch>
  }> {
    const { rb, f } = browser({
      [nameUrl('a.example')]: { body: byName },
      [tagUrl('a.example')]: { body: byTag },
      [clickUrl('a.example', 'ae7aeb65-5a30-4848-8059-91b2bc2dcfd9')]: { body: {} },
      [clickUrl('a.example', '960eb2e9-0601-11e8-ae97-52543be04c81')]: { body: {} }
    })
    await rb.search('drone')
    f.calls.length = 0
    return { rb, f }
  }
  const zone = 'rb-960eb2e9-0601-11e8-ae97-52543be04c81'

  it('counts the record of the stream that opens, once per play', async () => {
    const { rb, f } = await searched()
    rb.played(zone)
    // the 256k stream is another record of the same station
    await rb.opened(zone, 'https://ice6.somafm.com/dronezone-256-mp3')
    // a reconnect
    await rb.opened(zone, 'https://ice6.somafm.com/dronezone-256-mp3')
    expect(f.calls.map((c) => c.url)).toEqual([
      clickUrl('a.example', 'ae7aeb65-5a30-4848-8059-91b2bc2dcfd9')
    ])
  })

  it("counts the station's own record for a stream not from search", async () => {
    const { rb, f } = await searched()
    rb.played(zone)
    await rb.opened(zone, 'https://ice6.somafm.com/found-on-the-server')
    expect(f.calls.map((c) => c.url)).toEqual([
      clickUrl('a.example', '960eb2e9-0601-11e8-ae97-52543be04c81')
    ])
  })

  it('counts a record once a run: Radio Browser counts one a day anyway', async () => {
    const { rb, f } = await searched()
    rb.played(zone)
    await rb.opened(zone, 'https://ice6.somafm.com/dronezone-128-mp3')
    rb.played(zone)
    await rb.opened(zone, 'https://ice6.somafm.com/dronezone-128-mp3')
    expect(f.calls).toHaveLength(1)
  })

  it('counts nothing for a station not from Radio Browser, or one not played', async () => {
    const { rb, f } = await searched()
    rb.played('metal-only')
    await rb.opened('metal-only', 'http://metalonly.spcast.eu/stream')
    await rb.opened(zone, 'https://ice6.somafm.com/dronezone-128-mp3')
    expect(f.calls).toEqual([])
  })

  it('logs a click that fails and goes on', async () => {
    const log = vi.fn()
    const rb = new RadioBrowser({
      fetch: fakeFetch({}),
      mirrors: async () => ['a.example'],
      userAgent: 'Spindle/1.0',
      log
    })
    rb.played('rb-x1')
    await rb.opened('rb-x1', 'http://x.example/')
    expect(log).toHaveBeenCalledWith(expect.stringContaining('x1'))
  })
})

describe('resolveMirrors', () => {
  it('names each address of all.api.radio-browser.info, once, in a shuffled order', async () => {
    const dns = {
      lookup: vi.fn(async () => [
        { address: '1.1.1.1', family: 4 },
        { address: '::1', family: 6 },
        { address: '2.2.2.2', family: 4 },
        { address: '3.3.3.3', family: 4 }
      ]),
      reverse: vi.fn(async (ip: string) => {
        if (ip === '3.3.3.3') throw new Error('ENOTFOUND')
        return ip === '2.2.2.2' ? ['nl1.api.radio-browser.info'] : ['de1.api.radio-browser.info']
      })
    }
    const names = await resolveMirrors(dns, () => 0)
    expect(dns.lookup).toHaveBeenCalledWith('all.api.radio-browser.info', { all: true })
    expect(names.at(-1)).toBe('all.api.radio-browser.info')
    expect(names.slice(0, -1).sort()).toEqual([
      'de1.api.radio-browser.info',
      'nl1.api.radio-browser.info'
    ])
  })

  it('uses all.api.radio-browser.info itself when no address has a name', async () => {
    const dns = {
      lookup: vi.fn(async () => [{ address: '1.1.1.1', family: 4 }]),
      reverse: vi.fn(async () => {
        throw new Error('ENOTFOUND')
      })
    }
    expect(await resolveMirrors(dns)).toEqual(['all.api.radio-browser.info'])
  })

  // A local DNS that proxies Radio Browser answers with its own address, and
  // that address's reverse name ("proxy.lan") does not resolve.
  it('keeps only Radio Browser names, and tries the round-robin name last', async () => {
    const dns = {
      lookup: vi.fn(async () => [
        { address: '10.0.0.2', family: 4 },
        { address: '2.2.2.2', family: 4 }
      ]),
      reverse: vi.fn(async (ip: string) =>
        ip === '2.2.2.2' ? ['DE1.api.radio-browser.info'] : ['proxy.lan']
      )
    }
    expect(await resolveMirrors(dns)).toEqual([
      'de1.api.radio-browser.info',
      'all.api.radio-browser.info'
    ])
  })

  it('uses the round-robin name when the only name is not Radio Browser', async () => {
    const dns = {
      lookup: vi.fn(async () => [{ address: '10.0.0.2', family: 4 }]),
      reverse: vi.fn(async () => ['proxy.lan'])
    }
    expect(await resolveMirrors(dns)).toEqual(['all.api.radio-browser.info'])
  })

  it('fails when the lookup fails (no network)', async () => {
    const dns = {
      lookup: vi.fn(async () => {
        throw new Error('getaddrinfo ENOTFOUND')
      }),
      reverse: vi.fn(async () => [])
    }
    await expect(resolveMirrors(dns)).rejects.toThrow('ENOTFOUND')
  })
})
