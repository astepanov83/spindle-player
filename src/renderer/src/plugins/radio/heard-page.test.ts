// The Radio tab's "Heard on radio" page (ticket 119): newest first, a song in
// the library plays and links to its album, one that is not offers Search
// and Copy, and the heart lets one go.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultPalettes } from '../../../../shared/palette'
import { heardSong, type HeardSong } from '../../../../shared/plugins/radio/heard'
import type { EmptyBlock, HeadBlock, ItemInfo, ItemRow, RowsBlock, Tab } from '../types'

const heardRemove = vi.fn(async (): Promise<HeardSong[]> => [])
const writeText = vi.fn(async () => {})
vi.stubGlobal('window', { radioApi: { heardRemove }, playbackApi: { log: vi.fn() } })
vi.stubGlobal('navigator', { clipboard: { writeText } })

// the core: a made-up library with one song, and the search tabs
const core = vi.hoisted(() => ({
  library: new Map<string, string>(),
  tabs: [] as (Tab & { plugin: string })[]
}))
const album = { plugin: 'files' as const, page: 'album/al', item: 't1' }
const info: ItemInfo = {
  title: 'Holy Diver',
  group: 'Holy Diver (Album)',
  titleTo: album,
  art: {
    cover: 'spindle://cover/small/' + 'f'.repeat(40),
    coverLarge: '',
    palette: defaultPalettes
  }
}
const openPage = vi.fn()
const searchFor = vi.fn()
vi.mock('../index', () => ({
  findSong: (artist: string, title: string) => core.library.get(`${artist} - ${title}`),
  infoOf: (key: string) => (key === 'files:t1' ? info : undefined),
  openPage,
  pluginTabs: () => core.tabs,
  searchFor
}))
vi.mock('./store.svelte', () => ({ radioPage: { plugin: 'radio', page: '' } }))

const { heardBlocks, heardDate, actOnHeard, heardRowKey } = await import('./heard-page')
const { heard } = await import('./heard.svelte')
const { notice } = await import('../../stores/notice.svelte')

const now = new Date(2026, 9, 13, 22, 0).getTime()
const song = (raw: string, at: number, o: Partial<HeardSong> = {}): HeardSong => ({
  ...heardSong(raw, { id: 'metal-only', name: 'Metal Only' }, at)!,
  ...o
})
const rows = (b: RowsBlock): ItemRow[] => b.items.map((x) => b.row(x) as ItemRow)
const albums = { id: 'albums', label: 'Albums', icon: 'disc', search: 'Search your library' }

beforeEach(() => {
  core.library = new Map([['Dio - Holy Diver', 'files:t1']])
  core.tabs = [{ ...albums, searchWide: true, plugin: 'files' } as Tab & { plugin: string }]
  // oldest first, as main sends them
  heard.load([
    song('Station Jingle', new Date(2025, 11, 31).getTime()),
    song('Unknown Band - Deep Cut', new Date(2026, 8, 28, 9, 0).getTime(), {
      art: { hash: 'a'.repeat(40), palette: defaultPalettes }
    }),
    song('Dio - Holy Diver', new Date(2026, 9, 13, 21, 14).getTime())
  ])
  vi.clearAllMocks()
  notice.text = ''
})

describe('the page', () => {
  it('a head back to Radio, then the songs newest heard first', () => {
    const [head, list] = heardBlocks(now)
    expect(head as HeadBlock).toMatchObject({
      kind: 'head',
      title: 'Heard on radio',
      back: { label: 'Radio', to: { plugin: 'radio', page: '' } },
      line: [{ text: '3 songs · 1 in your library' }]
    })
    expect(rows(list as RowsBlock).map((r) => [r.title, r.subtitle, r.details, r.meta])).toEqual([
      ['Holy Diver', 'Dio', ['Metal Only'], '21:14'],
      ['Deep Cut', 'Unknown Band', ['Metal Only'], '28 Sep'],
      ['Station Jingle', undefined, ['Metal Only'], '31 Dec 2025']
    ])
  })

  it('a song in the library plays from its row, with the others kept there, and links to its album', () => {
    const [, list] = heardBlocks(now)
    const r = rows(list as RowsBlock)[0]
    expect(r.play).toBe('files:t1')
    expect(r.queue).toEqual({ items: ['files:t1'] })
    // no cover found online: the album's
    expect(r.art).toBe(info.art!.cover)
    expect(r.buttons).toEqual([{ id: 'album', label: 'Album', hint: 'Go to Holy Diver (Album)' }])
    expect(r.menu?.map((m) => m.id)).toEqual(['album', 'copy', 'remove'])
    expect(r.star).toEqual({ on: true, label: 'Remove from Heard on radio', heart: true })
  })

  it('a song not in the library: its cover, Search and Copy, nothing to play', () => {
    const [, list] = heardBlocks(now)
    const r = rows(list as RowsBlock)[1]
    expect(r.play).toBeUndefined()
    expect(r.art).toBe('spindle://cover/small/' + 'a'.repeat(40))
    expect(r.buttons).toEqual([
      { id: 'search', label: 'Search', hint: 'Search your library for "Deep Cut"' },
      { id: 'copy', label: 'Copy', hint: 'Copy "Unknown Band - Deep Cut"' }
    ])
    expect(r.menu?.map((m) => m.id)).toEqual(['search', 'copy', 'remove'])
  })

  it('no Search when no plugin searches the library', () => {
    core.tabs = []
    const [, list] = heardBlocks(now)
    expect(rows(list as RowsBlock)[1].buttons?.map((b) => b.id)).toEqual(['copy'])
  })

  it('says what the page is for while it is empty', () => {
    heard.load([])
    const [head, empty] = heardBlocks(now)
    expect((head as HeadBlock).line).toEqual([{ text: 'No songs yet' }])
    expect((empty as EmptyBlock).text).toMatch(/press the heart/)
  })

  it('dates: the time today, the day this year, with the year before', () => {
    expect(heardDate(new Date(2026, 9, 13, 8, 5).getTime(), now)).toBe('08:05')
    expect(heardDate(new Date(2026, 0, 2).getTime(), now)).toBe('2 Jan')
    expect(heardDate(new Date(2024, 0, 2).getTime(), now)).toBe('2 Jan 2024')
  })
})

describe("a row's buttons", () => {
  const key = (raw: string): string => heardRowKey(heard.songs.find((s) => s.raw === raw)!)

  it('Album opens the album at the song', () => {
    actOnHeard(key('Dio - Holy Diver'), 'album')
    expect(openPage).toHaveBeenCalledWith(album)
  })

  it("Search puts the song's title in the library's search", () => {
    actOnHeard(key('Unknown Band - Deep Cut'), 'search')
    expect(searchFor).toHaveBeenCalledWith('Deep Cut', 'radio')
  })

  it('Copy copies "Artist - Song" and says so', async () => {
    actOnHeard(key('Unknown Band - Deep Cut'), 'copy')
    await vi.waitFor(() => expect(notice.text).toBe('Copied "Unknown Band - Deep Cut"'))
    expect(writeText).toHaveBeenCalledWith('Unknown Band - Deep Cut')
  })

  it('the heart and Remove let it go, with Undo', async () => {
    actOnHeard(key('Dio - Holy Diver'), 'star')
    await vi.waitFor(() => expect(notice.text).toBe('Removed Holy Diver'))
    expect(heardRemove).toHaveBeenCalledWith('Dio - Holy Diver')
    expect(notice.action?.label).toBe('Undo')
    expect(heard.songs).toEqual([])
    expect(notice.action).toBeDefined()
  })
})
