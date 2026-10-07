// The MFP tab's pages and its search group, from made-up episodes as main
// sends them (ticket 061).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Episode, MfpEpisodes } from '../../../../shared/plugins/mfp/mfp'
import { defaultPalettes } from '../../../../shared/palette'
import type { Block, HeadBlock, PageRow, RowsBlock, SongsBlock } from '../types'

let mfp: typeof import('./store.svelte').mfp
let page: typeof import('./page')
let settings: typeof import('./settings')

function episode(id: string, title: string, artist: string, songs: [string, string][]): Episode {
  const length = songs.length * 100
  return {
    id,
    title,
    artist,
    year: 2026,
    link: `https://musicforprogramming.net/${id}`,
    length,
    songs: songs.map(([t, a], i) => ({
      id: `${id}${i}`,
      title: t,
      artist: a,
      start: i * 100,
      ...(i < songs.length - 1 ? { end: (i + 1) * 100 } : {}),
      length: 100
    }))
  }
}

const data = (): MfpEpisodes => ({
  episodes: [
    episode('b', '2: Paper Suns', 'Oda Linde', [
      ['Origami', 'Ochre'],
      ['Kite String', 'Fennesz'],
      ['Paper Suns', 'Oda']
    ]),
    episode('a', '1: Night Bus', 'The Quiet Hours', [
      ['Route 38', 'QH'],
      ['Terminus', 'Fennesz']
    ])
  ],
  cover: { hash: 'c'.repeat(40), palette: defaultPalettes }
})

const kinds = (b: Block[]): string[] => b.map((x) => x.kind)
const head = (b: Block): HeadBlock => b as HeadBlock
const rows = (b: Block): RowsBlock => b as RowsBlock
const songs = (b: Block): SongsBlock => b as SongsBlock
const ids = (b: Block): string[] => rows(b).items.map((e) => (e as Episode).id)

beforeEach(async () => {
  vi.resetModules()
  mfp = (await import('./store.svelte')).mfp
  page = await import('./page')
  settings = await import('./settings')
  mfp.load(data())
  mfp.status = { episodes: 2, fetchedAt: 1, running: false }
})

describe('the episode list', () => {
  it('is a head and a row per episode, newest first, with year, songs and length', () => {
    const blocks = page.mfpPage('mfp', '', '')
    expect(kinds(blocks)).toEqual(['head', 'rows'])
    expect(head(blocks[0])).toMatchObject({
      look: 'list',
      title: 'Music For Programming',
      meta: 'Online',
      count: '2 episodes'
    })
    expect(head(blocks[0]).hint).toBeUndefined()
    // the store's list as it is
    expect(rows(blocks[1]).items).toBe(mfp.episodes)
    const r = rows(blocks[1]).row(mfp.episodes[0]) as PageRow
    expect(r).toMatchObject({
      title: '2: Paper Suns',
      art: `spindle://cover/small/${'c'.repeat(40)}`,
      details: ['2026', '3 songs'],
      meta: '5 min',
      to: { plugin: 'mfp', page: 'episode/b' },
      from: '2: Paper Suns',
      link: { plugin: 'mfp', page: 'episode/b' }
    })
    expect(r.songs()).toEqual(['mfp:b0', 'mfp:b1', 'mfp:b2'])
    expect(r.playing?.('mfp:b1')).toBe(true)
    expect(r.playing?.('mfp:a1')).toBe(false)
    expect(r.playing?.('files:b1')).toBe(false)
  })

  it('says the site is being read, or what went wrong, under its title', () => {
    mfp.status = { episodes: 2, fetchedAt: 1, running: true }
    expect(head(page.mfpPage('mfp', '', '')[0]).hint).toBe('2 episodes, looking for new ones…')
  })

  it('has no episodes before the site was read', () => {
    mfp.load({ episodes: [] })
    mfp.status = { episodes: 0, fetchedAt: 0, running: true }
    const blocks = page.mfpPage('mfp', '', '')
    expect(kinds(blocks)).toEqual(['head', 'empty'])
    expect(blocks[1]).toMatchObject({
      title: 'No episodes yet',
      text: 'Reading musicforprogramming.net…'
    })
  })
})

describe('the tab search', () => {
  it('shows an episode whose title or mixer matches, with no songs under it', () => {
    const blocks = page.mfpPage('mfp', '', 'linde')
    expect(kinds(blocks)).toEqual(['head', 'rows'])
    expect(ids(blocks[1])).toEqual(['b'])
  })

  it('shows an episode with the songs in it that match under it; a click plays the episode', () => {
    const blocks = page.mfpPage('mfp', '', 'fennesz')
    expect(kinds(blocks)).toEqual(['head', 'rows', 'songs', 'rows', 'songs'])
    expect(ids(blocks[1])).toEqual(['b'])
    expect(songs(blocks[2])).toMatchObject({
      items: ['mfp:b1'],
      numbers: [2],
      starts: { at: [100], hint: 'Guessed start' },
      queue: ['mfp:b0', 'mfp:b1', 'mfp:b2'],
      from: '2: Paper Suns',
      link: { plugin: 'mfp', page: 'episode/b' }
    })
    expect(ids(blocks[3])).toEqual(['a'])
    expect(songs(blocks[4]).items).toEqual(['mfp:a1'])
  })

  it('keeps episodes that match side by side in one list', () => {
    const blocks = page.mfpPage('mfp', '', '  :  ')
    expect(kinds(blocks)).toEqual(['head', 'rows'])
    expect(ids(blocks[1])).toEqual(['b', 'a'])
  })

  it('says when nothing matches', () => {
    const blocks = page.mfpPage('mfp', '', 'zzz')
    expect(kinds(blocks)).toEqual(['head', 'empty'])
    expect(blocks[1]).toMatchObject({ title: 'No matches', nothingFound: true })
  })
})

describe('an episode', () => {
  it('is its head and its songs at their guessed times', () => {
    const [h, s] = page.mfpPage('mfp', 'episode/b', '')
    expect(head(h)).toMatchObject({
      look: 'album',
      id: 'episode/b',
      title: '2: Paper Suns',
      meta: 'Music For Programming',
      art: { src: `spindle://cover/large/${'c'.repeat(40)}` },
      back: { label: 'All episodes', to: { plugin: 'mfp', page: '' } },
      line: [{ text: 'Oda Linde · 2026 · 3 songs · 5 min' }],
      link: { label: 'musicforprogramming.net/b', url: 'https://musicforprogramming.net/b' },
      note: { text: 'Song times are guessed: the site gives none.', items: [] }
    })
    expect(head(h).buttons?.map((b) => b.label)).toEqual([
      'Play',
      'Shuffle',
      'Add to playlist',
      'Play next, add to the queue or a playlist'
    ])
    const play = head(h).buttons![0]
    expect('play' in play && [play.play, play.songs(), play.link]).toEqual([
      'all',
      ['mfp:b0', 'mfp:b1', 'mfp:b2'],
      { plugin: 'mfp', page: 'episode/b' }
    ])
    // no Show in file manager
    const more = head(h).buttons![3]
    expect('menu' in more && more.actions).toBeUndefined()
    expect(songs(s)).toMatchObject({
      items: ['mfp:b0', 'mfp:b1', 'mfp:b2'],
      numbers: [1, 2, 3],
      starts: { at: [0, 100, 200], hint: 'Guessed start' },
      from: '2: Paper Suns'
    })
    expect(songs(s).sort).toBeUndefined()
  })

  it('filters its songs with the search box; a click still plays the episode', () => {
    const [, s] = page.mfpPage('mfp', 'episode/b', 'kite')
    expect(songs(s)).toMatchObject({
      items: ['mfp:b1'],
      numbers: [2],
      queue: ['mfp:b0', 'mfp:b1', 'mfp:b2']
    })
  })

  it('that is gone shows the list', () => {
    expect(kinds(page.mfpPage('mfp', 'episode/gone', ''))).toEqual(['head', 'rows'])
  })
})

describe('In MFP mixes', () => {
  it('finds songs by title or artist, in episode order', () => {
    expect(page.mfpSearch('fennesz')).toEqual([
      { id: 'mixes', title: 'In MFP mixes', songs: ['mfp:b1', 'mfp:a1'] }
    ])
    expect(page.mfpSearch('terminus')[0]).toMatchObject({ songs: ['mfp:a1'] })
    // not by the episode
    expect(page.mfpSearch('night bus')[0]).toMatchObject({ songs: [] })
  })
})

describe('the status line (ticket 052)', () => {
  const day = 24 * 3600 * 1000
  // noon on 1 Oct 2026, local time
  const now = new Date(2026, 9, 1, 12).getTime()
  const line = (m: Parameters<typeof settings.mfpLine>[0]): string | undefined =>
    settings.mfpLine(m, now)

  it('shows nothing while MFP is off', () => {
    expect(line(undefined)).toBeUndefined()
  })

  it('says when the episodes were last read', () => {
    const s = { episodes: 79, running: false }
    expect(line({ ...s, fetchedAt: now - 3600 * 1000 })).toBe('79 episodes, updated today')
    expect(line({ ...s, fetchedAt: now - day })).toBe('79 episodes, updated yesterday')
    expect(line({ ...s, fetchedAt: now - 5 * day })).toBe('79 episodes, updated 5 days ago')
    expect(line({ episodes: 1, running: false, fetchedAt: now })).toBe('1 episode, updated today')
  })

  it('says it is reading the site', () => {
    expect(line({ episodes: 0, fetchedAt: 0, running: true })).toBe(
      'Reading musicforprogramming.net…'
    )
    expect(line({ episodes: 79, fetchedAt: now, running: true })).toBe(
      '79 episodes, looking for new ones…'
    )
  })

  it('says why the last read failed, keeping what it has', () => {
    expect(line({ episodes: 0, fetchedAt: 0, running: false, error: 'timeout' })).toBe(
      'Could not read musicforprogramming.net: timeout'
    )
    expect(line({ episodes: 79, fetchedAt: now - day, running: false, error: 'timeout' })).toBe(
      '79 episodes, updated yesterday · Could not read musicforprogramming.net: timeout'
    )
  })

  it('in Settings with the button, which is off while the site is read', () => {
    mfp.status = { episodes: 79, fetchedAt: now, running: false }
    expect(settings.mfpSettings(now)).toEqual([
      { kind: 'status', text: '79 episodes, updated today', busy: false },
      { kind: 'button', id: 'refresh', label: 'Check for new episodes', disabled: false }
    ])
    mfp.status = undefined
    expect(settings.mfpSettings(now)).toEqual([])
  })
})
