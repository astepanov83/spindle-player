// The Radio tab as blocks (ticket 062): My stations and a search answer, and
// a row's star and menu reaching the plugin.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultPalettes } from '../../../../shared/palette'
import type { Station } from '../../../../shared/stations'
import type { Block, EmptyBlock, HeadBlock, ItemRow, RowsBlock } from '../types'

vi.stubGlobal('window', { radioApi: { search: vi.fn(() => new Promise(() => {})) } })

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
  vi.clearAllMocks()
})

describe('My stations', () => {
  it('a list head that points at the search box, then the stations as rows', () => {
    const b = radioBlocks('')
    expect(kinds(b)).toEqual(['head', 'text', 'rows'])
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
      ['b', -1],
      ['a', 1]
    ])
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

describe('the search box', () => {
  it('asks Radio Browser after typing stops, or at once on Enter', () => {
    const want = vi.spyOn(radioSearch, 'want')
    const now = vi.spyOn(radioSearch, 'now')
    radioHalf.typed!('radio', 'drone', false)
    expect(want).toHaveBeenCalledWith('drone')
    radioHalf.typed!('radio', 'drone', true)
    expect(now).toHaveBeenCalledWith('drone')
  })
})
