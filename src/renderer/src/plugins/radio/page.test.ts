// The Radio tab as blocks (tickets 062, 082): My stations and a search
// answer, tags and popular stations before a search, and a row's star, menu
// and drag reaching the plugin.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultPalettes } from '../../../../shared/palette'
import type { Station } from '../../../../shared/plugins/radio/stations'
import type { Block, ChipsBlock, EmptyBlock, HeadBlock, ItemRow, RowsBlock } from '../types'

const never = (): Promise<never> => new Promise(() => {})
vi.stubGlobal('window', { radioApi: { search: vi.fn(never), popular: vi.fn(never) } })

// the real store starts the audio engine; the page only reads its list
const radio = vi.hoisted(() => ({
  stations: [] as Station[],
  station: undefined as Station | undefined,
  loaded: true,
  find(id: string): Station | undefined {
    return (
      this.stations.find((s) => s.id === id) ?? (this.station?.id === id ? this.station : undefined)
    )
  },
  save: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
  move: vi.fn(async () => {}),
  choose: vi.fn()
}))
vi.mock('./store.svelte', () => ({ radio, radioPage: { plugin: 'radio', page: '' } }))

const { radioBlocks } = await import('./page')
const { radioSearch } = await import('./search.svelte')
const { radioPopular } = await import('./popular.svelte')
const { radioHalf } = await import('./index')

const hash = 'a'.repeat(40)
const st = (id: string, o: Partial<Station> = {}): Station => ({
  id,
  name: `Station ${id}`,
  tags: ['jazz', 'swing'],
  country: 'US',
  streams: [
    { url: `https://${id}/1`, bitrate: 64 },
    { url: `https://${id}/2`, bitrate: 128 }
  ],
  ...o
})

const kinds = (b: Block[]): string[] => b.map((x) => x.kind)
const rows = (b: Block): ItemRow[] => {
  const r = b as RowsBlock
  return r.items.map((x) => r.row(x) as ItemRow)
}
const text = (b: Block): string | undefined => (b as EmptyBlock).text

beforeEach(() => {
  radio.stations = [
    st('a', { logo: { hash, palette: defaultPalettes } }),
    st('b', { tags: ['drone'], country: undefined }),
    st('c')
  ]
  radio.station = undefined
  radioSearch.status = 'idle'
  radioSearch.results = []
  radioPopular.status = 'done'
  radioPopular.stations = []
  vi.clearAllMocks()
})

describe('My stations', () => {
  it('a list head that points at the search box, then the stations as rows', () => {
    const b = radioBlocks('')
    expect(kinds(b)).toEqual(['head', 'text', 'rows', 'chips'])
    expect(b[0] as HeadBlock).toEqual({
      kind: 'head',
      look: 'list',
      id: '',
      title: 'Radio',
      meta: 'Internet radio',
      count: '3 stations',
      searchHint: 'Find stations with the search box'
    })
    expect(b[1]).toEqual({ kind: 'text', text: 'My stations' })
    const [a, bb, c] = rows(b[2])
    expect(a).toEqual({
      title: 'Station a',
      subtitle: 'jazz, swing · us',
      art: `spindle://cover/small/${hash}`,
      meta: '64-128 kbps',
      play: 'radio:a',
      star: { on: true, label: 'Remove from My stations' },
      menu: [
        { id: 'down', label: 'Move down' },
        { id: 'remove', label: 'Remove' }
      ]
    })
    expect(bb.subtitle).toBe('drone')
    expect(bb.art).toBeUndefined()
    expect(bb.menu?.map((m) => m.id)).toEqual(['up', 'down', 'remove'])
    expect(c.menu?.map((m) => m.id)).toEqual(['up', 'remove'])
    expect((b[2] as RowsBlock).key(radio.stations[1])).toBe('b')
    // My stations can be dragged; results can't
    expect((b[2] as RowsBlock & { reorder?: boolean }).reorder).toBe(true)
  })

  it('are filtered at once by the search box; up and down follow the whole list', () => {
    const b = radioBlocks(' drone ')
    expect(rows(b[2]).map((r) => r.title)).toEqual(['Station b'])
    expect(rows(b[2])[0].menu?.map((m) => m.id)).toEqual(['up', 'down', 'remove'])
  })

  it('says how to add one when there are none, and when none match', () => {
    radio.stations = []
    let b = radioBlocks('')
    expect(kinds(b)).toEqual(['head', 'text', 'rows', 'empty'])
    expect((b[0] as HeadBlock).count).toBe('0 stations')
    expect(b[3]).toEqual({
      kind: 'empty',
      id: '',
      text: 'No stations yet. Search for one, then press its star to keep it here.'
    })
    radio.stations = [st('a')]
    b = radioBlocks('zzz')
    expect(rows(b[2])).toEqual([])
    expect(text(b[3])).toBe('None of My stations match.')
  })
})

describe('a Radio Browser answer', () => {
  it('shows the stations not in My stations, with logos through main', () => {
    radioSearch.status = 'done'
    radioSearch.results = [
      st('rb-1', { logoUrl: 'https://x/logo.png' }),
      radio.stations[0],
      st('rb-2')
    ]
    const b = radioBlocks('swing')
    expect(kinds(b)).toEqual(['head', 'text', 'rows', 'text', 'rows'])
    expect(b[3]).toEqual({ kind: 'text', text: 'From Radio Browser' })
    const found = rows(b[4])
    expect(found.map((r) => r.play)).toEqual(['radio:rb-1', 'radio:rb-2'])
    expect(found[0]).toMatchObject({
      art: 'spindle://radio-logo/rb-1',
      star: { on: false, label: 'Add to My stations' }
    })
    expect(found[0].menu).toBeUndefined()
    expect(found[1].art).toBeUndefined()
    expect((b[4] as RowsBlock).stale).toBe(false)
    expect('reorder' in b[4]).toBe(false)
  })

  it('keeps the older answer faded while a new search runs, else says it searches', () => {
    radioSearch.status = 'searching'
    radioSearch.results = [st('rb-1')]
    let b = radioBlocks('jazz')
    expect((b[4] as RowsBlock).stale).toBe(true)
    radioSearch.results = []
    b = radioBlocks('jazz')
    expect(text(b[4])).toBe('Searching…')
  })

  it('tells no stations found from Radio Browser that can’t be reached', () => {
    radioSearch.status = 'done'
    expect(text(radioBlocks('x').at(-1)!)).toBe('No stations found.')
    radioSearch.results = [radio.stations[1]]
    expect(text(radioBlocks('x').at(-1)!)).toBe('Every station found is in My stations.')
    radioSearch.status = 'unreachable'
    radioSearch.results = []
    expect(text(radioBlocks('x').at(-1)!)).toBe(
      "Radio Browser can't be reached. My stations still play."
    )
  })

  it('a result is an item while it shows, so it can be played', () => {
    expect(radioHalf.info('rb-1').state).toBe('missing')
    radioSearch.results = [st('rb-1')]
    expect(radioHalf.info('rb-1')).toMatchObject({ state: 'ok', info: { title: 'Station rb-1' } })
  })
})

describe('a row’s star and menu', () => {
  it('star saves a result, or the playing copy of it', () => {
    const found = st('rb-1')
    radioSearch.results = [found]
    radioHalf.act!('rb-1', 'star')
    expect(radio.save).toHaveBeenCalledWith(found)
    const playing = { ...found, chosen: 'https://rb-1/2' }
    radio.station = playing
    radioHalf.act!('rb-1', 'star')
    expect(radio.save).toHaveBeenLastCalledWith(playing)
  })

  it('star on a saved station removes it, as Remove does', () => {
    radioHalf.act!('b', 'star')
    radioHalf.act!('c', 'remove')
    expect(radio.remove.mock.calls).toEqual([['b'], ['c']])
    expect(radio.save).not.toHaveBeenCalled()
  })

  it('moves a station up or down', () => {
    radioHalf.act!('b', 'up')
    radioHalf.act!('a', 'down')
    expect(radio.move.mock.calls).toEqual([
      ['b', 0],
      ['a', 1]
    ])
  })

  it('a drag moves a station to the place of the one it was dropped on', () => {
    radioHalf.act!('a', 'move', 'c')
    radioHalf.act!('c', 'move', 'a')
    radioHalf.act!('c', 'move', 'zz')
    radioHalf.act!('zz', 'move', 'a')
    expect(radio.move.mock.calls).toEqual([
      ['a', 2],
      ['c', 0]
    ])
  })

  it('star saves a popular station', () => {
    const p = st('rb-p')
    radioPopular.stations = [p]
    radioHalf.act!('rb-p', 'star')
    expect(radio.save).toHaveBeenCalledWith(p)
  })

  it('does nothing for a station it does not know', () => {
    radioHalf.act!('zz', 'star')
    radioHalf.act!('zz', 'remove')
    expect(radio.save).not.toHaveBeenCalled()
    expect(radio.remove).not.toHaveBeenCalled()
  })

  it('the bar’s Save and stream stay the playing station’s', () => {
    radio.station = st('rb-1')
    radioHalf.act!('rb-1', 'save')
    radioHalf.act!('rb-1', 'stream', '1')
    radioHalf.act!('a', 'save')
    expect(radio.save).toHaveBeenCalledOnce()
    expect(radio.choose).toHaveBeenCalledExactlyOnceWith(1)
  })
})

describe('before a search (082)', () => {
  const chips = (b: Block[]): ChipsBlock | undefined =>
    b.find((x): x is ChipsBlock => x.kind === 'chips')

  it('offers the tags of My stations, the most shared first', () => {
    expect(chips(radioBlocks(''))).toEqual({
      kind: 'chips',
      label: 'Search a tag',
      words: ['jazz', 'swing', 'drone']
    })
  })

  it('shows the popular stations not in My stations, up to 20, with logos through main', () => {
    radioPopular.stations = [
      radio.stations[1],
      st('rb-1', { logoUrl: 'https://x/logo.png' }),
      ...Array.from({ length: 30 }, (_, i) => st(`rb-n${i}`))
    ]
    const b = radioBlocks('')
    expect(kinds(b)).toEqual(['head', 'text', 'rows', 'chips', 'text', 'rows'])
    expect(b[4]).toEqual({ kind: 'text', text: 'Popular stations' })
    const found = rows(b[5])
    expect(found).toHaveLength(20)
    expect(found[0]).toMatchObject({
      play: 'radio:rb-1',
      art: 'spindle://radio-logo/rb-1',
      star: { on: false, label: 'Add to My stations' }
    })
    expect('reorder' in b[5]).toBe(false)
  })

  it('says it loads, or one quiet line when Radio Browser can’t be reached', () => {
    radioPopular.status = 'loading'
    expect(text(radioBlocks('').at(-1)!)).toBe('Loading…')
    radioPopular.status = 'unreachable'
    const b = radioBlocks('')
    expect(b.at(-2)).toEqual({ kind: 'text', text: 'Popular stations' })
    expect(text(b.at(-1)!)).toBe("Radio Browser can't be reached.")
  })

  it('shows no popular heading when all of them are in My stations', () => {
    radioPopular.stations = [radio.stations[0]]
    expect(kinds(radioBlocks(''))).toEqual(['head', 'text', 'rows', 'chips'])
  })

  it('a new user gets the popular stations’ tags', () => {
    radio.stations = []
    radioPopular.stations = [st('rb-1', { tags: ['pop', 'news'] }), st('rb-2', { tags: ['news'] })]
    expect(chips(radioBlocks(''))?.words).toEqual(['news', 'pop'])
  })

  it('shows neither while searching', () => {
    radioPopular.stations = [st('rb-1')]
    radioSearch.status = 'searching'
    const b = radioBlocks('jazz')
    expect(chips(b)).toBeUndefined()
    expect(b.some((x) => x.kind === 'text' && x.text === 'Popular stations')).toBe(false)
  })

  it('a popular station is an item while it shows, so it can be played', () => {
    radioPopular.stations = [st('rb-p')]
    expect(radioHalf.info('rb-p')).toMatchObject({ state: 'ok', info: { title: 'Station rb-p' } })
  })
})

describe('the search box', () => {
  it('asks for the popular stations when the tab opens', () => {
    const want = vi.spyOn(radioPopular, 'want')
    radioHalf.typed!('radio', '', false)
    expect(want).toHaveBeenCalled()
  })

  it('asks Radio Browser after typing stops, or at once on Enter', () => {
    const want = vi.spyOn(radioSearch, 'want')
    const now = vi.spyOn(radioSearch, 'now')
    radioHalf.typed!('radio', 'drone', false)
    expect(want).toHaveBeenCalledWith('drone')
    radioHalf.typed!('radio', 'drone', true)
    expect(now).toHaveBeenCalledWith('drone')
  })
})
