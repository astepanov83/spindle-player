// The files plugin's pages as blocks, for a small made-up library: two
// albums by Marina Vale (one with two discs) and one by Juno Park, in
// folders /m/Rock and /m/Rock/Live.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Album, LibraryData, Track } from '../../../../shared/library'
import { defaultPalettes } from '../../../../shared/palette'
import type { Block, HeadBlock, RowsBlock, SongsBlock, TilesBlock } from '../types'

const api = { addFolder: vi.fn(), setArtists: vi.fn() }
vi.stubGlobal('window', {
  libraryApi: api,
  radioApi: { onTitle: () => () => {}, onLogo: () => () => {}, onCover: () => () => {} }
})

let library: typeof import('../../stores/library.svelte').library
let page: typeof import('./page')

const album = (id: string, trackIds: string[], extra: Partial<Album> = {}): Album => ({
  id,
  title: `Album ${id}`,
  artist: 'Marina Vale',
  year: 2003,
  palette: defaultPalettes,
  cover: `c-${id}`,
  coverLarge: `C-${id}`,
  trackIds,
  ...extra
})

const track = (id: string, albumId: string, extra: Partial<Track> = {}): Track => ({
  id,
  title: `Song ${id}`,
  duration: 120,
  albumId,
  artist: 'Marina Vale',
  album: `Album ${albumId}`,
  no: 1,
  disc: 1,
  codec: '',
  folder: 1,
  ...extra
})

function lib(): LibraryData {
  return {
    albums: [
      album('a', ['a1', 'a2', 'a3']),
      album('b', ['b1'], { artist: 'Juno Park' }),
      album('ep', ['m1'], { online: 'mfp', artist: 'Mixer' })
    ],
    tracks: [
      track('a1', 'a', { no: 1, disc: 1 }),
      track('a2', 'a', { no: 2, disc: 1 }),
      track('a3', 'a', { no: 1, disc: 2, folder: 2 }),
      track('b1', 'b', { artist: 'Juno Park', folder: 2 }),
      track('m1', 'ep', { online: 'mfp', folder: -1 })
    ],
    folders: [
      { name: '/m', parent: -1 },
      { name: 'Rock', parent: 0 },
      { name: 'Live', parent: 1 }
    ]
  }
}

beforeEach(async () => {
  vi.resetModules()
  api.addFolder.mockClear()
  api.setArtists.mockClear()
  library = (await import('../../stores/library.svelte')).library
  page = await import('./page')
})

const kinds = (blocks: Block[]): string[] => blocks.map((b) => b.kind)
const head = (b: Block): HeadBlock => b as HeadBlock
const tiles = (b: Block): TilesBlock => b as TilesBlock
const songs = (b: Block): SongsBlock => b as SongsBlock
const files = (p: string): { plugin: 'files'; page: string } => ({ plugin: 'files', page: p })

describe('before there are songs', () => {
  it('shows one empty block, with the button to add a folder', () => {
    const [b] = page.filesPage('albums', '', '')
    expect(b).toMatchObject({ kind: 'empty', title: 'No music yet' })
    expect(b.kind === 'empty' && b.action?.id).toBe('add-folder')
    page.filesAct(b.kind === 'empty' ? b.id : '', 'add-folder')
    expect(api.addFolder).toHaveBeenCalledOnce()
    // the core's Playlists says what playlists are for, in Studio's list
    expect(page.filesEmptyPlaylists(true)?.title).toBe('No playlists yet')
    expect(page.filesEmptyPlaylists(false)?.title).toBe('No music yet')
  })

  it('says it is looking while a scan runs', () => {
    library.status = { ...library.status, phase: 'read', folders: ['/m'] }
    expect(page.filesPage('folders', '', '')[0]).toMatchObject({ title: 'Looking for music' })
    expect(page.filesPage('folders', '', '')[0]).not.toHaveProperty('action')
  })

  it('leaves the Playlists page alone once there are songs', () => {
    library.load(lib())
    expect(page.filesEmptyPlaylists(true)).toBeUndefined()
  })
})

describe('pages', () => {
  beforeEach(() => library.load(lib()))

  it('Albums: a head and the albums as tiles, the store array as it is', () => {
    const blocks = page.filesPage('albums', '', '')
    expect(kinds(blocks)).toEqual(['head', 'tiles'])
    expect(head(blocks[0])).toMatchObject({ title: 'Albums', meta: 'Library', count: '2 albums' })
    const t = tiles(blocks[1])
    expect(t.items).toBe(library.albums)
    const tile = t.tile(library.albums[0])
    expect(tile).toMatchObject({ title: 'Album a', subtitle: 'Marina Vale', to: files('album/a') })
    expect(tile.songs()).toEqual(['files:a1', 'files:a2', 'files:a3'])
    expect(tile.link).toEqual({ plugin: 'files', page: 'album/a' })
  })

  it('Albums with search text: the old search results', () => {
    expect(kinds(page.filesPage('albums', 'album/a', 'juno'))).toEqual(['view'])
  })

  it('an album: its head with links, and its songs with discs', () => {
    const [h, s] = page.filesPage('albums', 'album/a', '')
    expect(head(h)).toMatchObject({
      title: 'Album a',
      meta: 'Album · 2003',
      art: { src: 'C-a' },
      back: { label: 'All albums', to: files('') }
    })
    expect(head(h).line).toEqual([
      { text: 'Marina Vale', to: files('artist/marinavale') },
      { text: ' · 3 songs · 6 min' }
    ])
    // the songs are in two folders: the album is in the one above both
    expect(head(h).where?.to).toEqual(files(`folder/${library.folders.nodes[1].key}`))
    expect(head(h).buttons?.map((b) => b.label)[0]).toBe('Play')
    expect(songs(s)).toMatchObject({
      items: ['files:a1', 'files:a2', 'files:a3'],
      from: 'Album a',
      numbers: [1, 2, 1],
      groups: [
        { at: 0, label: 'Disc 1' },
        { at: 2, label: 'Disc 2' }
      ]
    })
    expect(songs(s)).not.toHaveProperty('sort')
  })

  it('an album that is gone shows the grid', () => {
    expect(kinds(page.filesPage('albums', 'album/gone', ''))).toEqual(['head', 'tiles'])
  })

  it('Artists: round tiles, filtered by the search, with a note for none', () => {
    const blocks = page.filesPage('artists', '', '')
    expect(tiles(blocks[1]).round).toBe(true)
    expect(tiles(blocks[1]).items).toBe(library.artists)
    const tile = tiles(blocks[1]).tile(library.getArtist('junopark'))
    expect(tile).toMatchObject({
      title: 'Juno Park',
      subtitle: '1 album',
      to: files('artist/junopark')
    })
    expect(tile.actions).toEqual([{ id: 'edit', label: 'Edit artist' }])
    const found = page.filesPage('artists', 'artist/marinavale', 'jun')
    expect(head(found[0]).count).toBe('1 artist')
    expect(kinds(page.filesPage('artists', '', 'nobody'))).toEqual(['head', 'empty', 'tiles'])
  })

  it('an artist: head with a round picture, their albums opening under them', () => {
    const blocks = page.filesPage('artists', 'artist/marinavale', '')
    expect(kinds(blocks)).toEqual(['head', 'text', 'tiles'])
    expect(head(blocks[0])).toMatchObject({
      title: 'Marina Vale',
      meta: 'Artist',
      art: { round: true }
    })
    expect(head(blocks[0]).line).toEqual([{ text: '1 album · 3 songs' }])
    const t = tiles(blocks[2])
    expect(t.tile(library.album('a'))).toMatchObject({
      subtitle: '2003',
      to: files('album/a/artist/marinavale')
    })
    // an album opened from them goes back to them
    const [h] = page.filesPage('artists', 'album/a/artist/marinavale', '')
    expect(head(h).back).toEqual({ label: 'Marina Vale', to: files('artist/marinavale') })
  })

  it('edits an artist: the names to save, and Cancel', () => {
    page.filesAct('artist/junopark', 'edit')
    const [h] = page.filesPage('artists', 'artist/junopark', '')
    expect(head(h).edit?.names).toEqual(['Juno Park'])
    expect(head(h).edit?.ok(['  '])).toBe(false)
    page.filesAct('artist/junopark', 'save', JSON.stringify(['Juno', 'Park']))
    expect(api.setArtists).toHaveBeenCalledWith({ junopark: ['Juno', 'Park'] })
    expect(library.editingArtist).toBeNull()
    page.filesAct('artist/junopark', 'edit')
    page.filesAct('artist/junopark', 'cancel')
    expect(library.editingArtist).toBeNull()
  })

  it('an artist tile opens its page to edit, from the grid', () => {
    library.pickTab('artists')
    page.filesAct('artist/junopark', 'edit')
    expect([library.page('artists'), library.editingArtist]).toEqual([
      'artist/junopark',
      'junopark'
    ])
  })

  it('Folders: the one music folder, then a folder with its path and songs', () => {
    const top = page.filesPage('folders', '', '')
    expect(kinds(top)).toEqual(['head', 'rows'])
    expect(head(top[0])).toMatchObject({ title: 'm', meta: 'Music folder' })
    expect(head(top[0]).line).toEqual([{ text: '1 folder · 4 songs' }])
    const rows = top[1] as RowsBlock
    expect(rows.filtered).toBe(true)
    expect(rows.row(rows.items[0])).toMatchObject({ title: 'Rock', meta: '4 songs' })
    expect(rows.row(rows.items[0]).subtitle).toBeUndefined()
    // the song playing is in it
    expect(rows.row(rows.items[0]).playing?.('files:b1')).toBe(true)
    expect(rows.row(rows.items[0]).playing?.('radio:x')).toBe(false)
    const [m, rock, live] = library.folders.nodes.map((n) => n.key)
    const blocks = page.filesPage('folders', `folder/${live}`, '')
    expect(kinds(blocks)).toEqual(['tree', 'head', 'rows', 'songs'])
    expect(blocks[0].kind === 'tree' && blocks[0].path).toEqual([
      { title: 'm', hint: m, to: files(`folder/${m}`), here: false },
      { title: 'Rock', hint: 'Rock', to: files(`folder/${rock}`), here: false },
      { title: 'Live', hint: 'Live', to: files(`folder/${live}`), here: true }
    ])
    expect(songs(blocks[3])).toMatchObject({
      items: ['files:a3', 'files:b1'],
      label: 'Songs in this folder',
      sort: null
    })
  })

  it('Folders: a search that finds nothing says so', () => {
    const [, rock] = library.folders.nodes.map((n) => n.key)
    expect(kinds(page.filesPage('folders', `folder/${rock}`, 'zzz'))).toEqual([
      'tree',
      'head',
      'empty',
      'rows'
    ])
  })

  it("Classic's Songs: every song in the library's sort, sorted through act", () => {
    const [s] = page.filesPage('songs', '', '')
    expect(songs(s)).toMatchObject({
      items: ['files:a1', 'files:a2', 'files:a3', 'files:b1'],
      meta: 'Library',
      sort: library.sort
    })
    page.filesAct(songs(s).id, 'sort', 't')
    expect(library.sort).toEqual({ k: 't', dir: 1 })
    page.filesAct('folders', 'sort', 'd')
    expect(library.folderSort).toEqual({ k: 'd', dir: 1 })
    page.filesAct('artist/junopark', 'sort', 'al')
    expect(library.artistSort).toEqual({ k: 'al', dir: 1 })
  })
})
