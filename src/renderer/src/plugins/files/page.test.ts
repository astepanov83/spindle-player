// The files plugin's pages as blocks, for a small made-up library: two
// albums by Marina Vale (one with two discs) and one by Juno Park, in
// folders /m/Rock and /m/Rock/Live.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Album, LibraryData, Track } from '../../../../shared/library'
import { defaultPalettes } from '../../../../shared/palette'
import {
  applyChanges,
  creditOf,
  resolve,
  type ArtistsFile
} from '../../../../shared/plugins/files/artists-file'
import type { Block, HeadBlock, PageRow, RowsBlock, SongsBlock, TilesBlock } from '../types'

const api = {
  addFolder: vi.fn(),
  setArtists: vi.fn(),
  showFolder: vi.fn(async (parts: string[]) => parts.length > 0)
}
vi.stubGlobal('window', {
  libraryApi: api,
  radioApi: { onTitle: () => () => {}, onLogo: () => () => {}, onCover: () => () => {} }
})

let library: typeof import('../../stores/library.svelte').library
let files: typeof import('./store.svelte').files
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
    albums: [album('a', ['a1', 'a2', 'a3']), album('b', ['b1'], { artist: 'Juno Park' })],
    tracks: [
      track('a1', 'a', { no: 1, disc: 1 }),
      track('a2', 'a', { no: 2, disc: 1 }),
      track('a3', 'a', { no: 1, disc: 2, folder: 2 }),
      track('b1', 'b', { artist: 'Juno Park', folder: 2 })
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
  api.showFolder.mockClear()
  library = (await import('../../stores/library.svelte')).library
  files = (await import('./store.svelte')).files
  page = await import('./page')
})

const kinds = (blocks: Block[]): string[] => blocks.map((b) => b.kind)
const head = (b: Block): HeadBlock => b as HeadBlock
const tiles = (b: Block): TilesBlock => b as TilesBlock
const songs = (b: Block): SongsBlock => b as SongsBlock
const at = (p: string): { plugin: 'files'; page: string } => ({ plugin: 'files', page: p })

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
    files.status = { ...files.status, phase: 'read', folders: ['/m'] }
    expect(page.filesPage('folders', '', '')[0]).toMatchObject({ title: 'Looking for music' })
    expect(page.filesPage('folders', '', '')[0]).not.toHaveProperty('action')
  })

  it('leaves the Playlists page alone once there are songs', () => {
    files.load(lib())
    expect(page.filesEmptyPlaylists(true)).toBeUndefined()
  })
})

describe('search (tickets 039, 059)', () => {
  beforeEach(() => files.load(lib()))

  it('finds songs by title or their artist, albums and artists', () => {
    const [found, albums, artists] = page.filesSearch('juno')
    expect(found).toEqual({ id: 'songs', title: 'Songs', songs: ['files:b1'] })
    expect(albums).toMatchObject({ id: 'albums', title: 'Albums' })
    expect('tiles' in albums && albums.tiles.items).toEqual([files.album('b')])
    expect('tiles' in artists && artists.tiles.round).toBe(true)
    expect('tiles' in artists && artists.tiles.items).toEqual([files.getArtist('junopark')])
    expect(page.filesSearch('song a')[0]).toMatchObject({
      songs: ['files:a1', 'files:a2', 'files:a3']
    })
  })
})

describe('pages', () => {
  beforeEach(() => files.load(lib()))

  it('Albums: a head and the albums as tiles, the store array as it is', () => {
    const blocks = page.filesPage('albums', '', '')
    expect(kinds(blocks)).toEqual(['head', 'tiles'])
    expect(head(blocks[0])).toMatchObject({
      look: 'list',
      title: 'Albums',
      meta: 'Library',
      count: '2 albums'
    })
    const t = tiles(blocks[1])
    expect(t.items).toBe(files.albums)
    const tile = t.tile(files.albums[0])
    expect(tile).toMatchObject({ title: 'Album a', subtitle: 'Marina Vale', to: at('album/a') })
    expect(tile.songs()).toEqual(['files:a1', 'files:a2', 'files:a3'])
    expect(tile.link).toEqual({ plugin: 'files', page: 'album/a' })
  })

  it('Albums with search text: the search results, over the open album', () => {
    expect(page.filesPage('albums', 'album/a', 'juno')).toEqual([
      { kind: 'results', empty: 'No song, album or artist has that in its name.' }
    ])
    // only spaces is no search
    expect(kinds(page.filesPage('albums', 'album/a', '  '))).toEqual(['head', 'songs'])
  })

  it("an album's song menu offers its folder in the file manager (ticket 050)", async () => {
    const [h] = page.filesPage('albums', 'album/a', '')
    const more = head(h).buttons?.find((b) => 'menu' in b && b.menu === 'songs')
    expect(more && 'actions' in more && more.actions).toEqual([
      { id: 'go-folder', label: 'Go to folder' },
      { id: 'show-folder', label: 'Show in file manager' }
    ])
    page.filesAct(head(h).id, 'show-folder')
    expect(api.showFolder).toHaveBeenLastCalledWith(['/m', 'Rock'])
    // it says so when the folder could not be opened
    api.showFolder.mockResolvedValueOnce(false)
    page.filesAct(head(h).id, 'show-folder')
    const { notice } = await import('../../stores/notice.svelte')
    await vi.waitFor(() => expect(notice.text).toBe("Couldn't open /m/Rock"))
    // from an album opened under its artist too
    const [under] = page.filesPage('artists', 'album/b/artist/junopark', '')
    page.filesAct(head(under).id, 'show-folder')
    expect(api.showFolder).toHaveBeenLastCalledWith(['/m', 'Rock', 'Live'])
  })

  it('an album: its head with links, and its songs with discs', () => {
    const [h, s] = page.filesPage('albums', 'album/a', '')
    expect(head(h)).toMatchObject({
      look: 'album',
      title: 'Album a',
      meta: 'Album · 2003',
      art: { src: 'C-a' },
      back: { label: 'All albums', to: at('') }
    })
    expect(head(h).line).toEqual([
      { text: 'Marina Vale', to: at('artist/marinavale') },
      { text: ' · 3 songs · 6 min' }
    ])
    // the songs are in two folders: the album is in the one above both. Its
    // path is the tooltip of the line over the title, not a line of its own.
    expect(head(h).metaHint).toBe('/m/Rock')
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
    // every song is Marina Vale's, as the album is: no Artist column
    expect(songs(s).artist).toBe(false)
  })

  it('"Go to folder" opens the album\'s folder in Folders, a step Back undoes (ticket 075)', () => {
    library.openPage('albums', 'album/a')
    page.filesAct('album/a', 'go-folder')
    expect(library.tab).toBe('folders')
    expect(library.page('folders')).toBe(`folder/${files.folders.nodes[1].key}`)
    library.back()
    expect([library.tab, library.page('albums')]).toEqual(['albums', 'album/a'])
  })

  it('an album of one song says "1 song" and "under a minute"', () => {
    files.load({
      albums: [album('s', ['s1'])],
      tracks: [track('s1', 's', { duration: 40 })],
      folders: lib().folders
    })
    const [h] = page.filesPage('albums', 'album/s', '')
    expect(head(h).line?.at(-1)).toEqual({ text: ' · 1 song · under a minute' })
  })

  it('keeps the Artist column where a song has another artist (ticket 075)', () => {
    files.load({
      albums: [album('v', ['v1', 'v2'], { artist: 'Various Artists' }), album('g', ['g1', 'g2'])],
      tracks: [
        track('v1', 'v', { artist: 'Kai' }),
        track('v2', 'v', { artist: 'Juno Park' }),
        track('g1', 'g'),
        track('g2', 'g', { artist: 'Marina Vale feat. Kai' })
      ],
      folders: lib().folders
    })
    // a compilation, and an album with a guest
    expect(songs(page.filesPage('albums', 'album/v', '')[1]).artist).toBe(true)
    expect(songs(page.filesPage('albums', 'album/g', '')[1]).artist).toBe(true)
    // Kai has only a song on the compilation: their page's table leaves out
    // the Artist column, the guest credit is its own artist
    const kai = page.filesPage('artists', 'artist/kai', '')
    expect(songs(kai.at(-1)!)).toMatchObject({ items: ['files:v1'], artist: false })
  })

  it('an album that is gone shows the grid', () => {
    expect(kinds(page.filesPage('albums', 'album/gone', ''))).toEqual(['head', 'tiles'])
  })

  it('Artists: round tiles, filtered by the search, with a note for none', () => {
    const blocks = page.filesPage('artists', '', '')
    expect(tiles(blocks[1]).round).toBe(true)
    expect(tiles(blocks[1]).items).toBe(files.artists)
    const tile = tiles(blocks[1]).tile(files.getArtist('junopark'))
    expect(tile).toMatchObject({
      title: 'Juno Park',
      subtitle: '1 album',
      to: at('artist/junopark')
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
      look: 'artist',
      title: 'Marina Vale',
      meta: 'Artist',
      art: { round: true }
    })
    expect(head(blocks[0]).line).toEqual([{ text: '1 album · 3 songs' }])
    const t = tiles(blocks[2])
    expect(t.tile(files.album('a'))).toMatchObject({
      subtitle: '2003',
      to: at('album/a/artist/marinavale')
    })
    // an album opened from them goes back to them
    const [h] = page.filesPage('artists', 'album/a/artist/marinavale', '')
    expect(head(h).back).toEqual({ label: 'Marina Vale', to: at('artist/marinavale') })
  })

  it('edits an artist: the names to save, and Cancel', () => {
    page.filesAct('artist/junopark', 'edit')
    const [h] = page.filesPage('artists', 'artist/junopark', '')
    expect(head(h).edit?.names).toEqual(['Juno Park'])
    expect(head(h).edit?.ok(['  '])).toBe(false)
    page.filesAct('artist/junopark', 'save', JSON.stringify(['Juno', 'Park']))
    expect(api.setArtists).toHaveBeenCalledWith({ junopark: ['Juno', 'Park'] })
    expect(files.editingArtist).toBeNull()
    page.filesAct('artist/junopark', 'edit')
    page.filesAct('artist/junopark', 'cancel')
    expect(files.editingArtist).toBeNull()
  })

  it('an artist tile opens its page to edit, from the grid', () => {
    library.pickTab('artists')
    page.filesAct('artist/junopark', 'edit')
    expect([library.page('artists'), files.editingArtist]).toEqual(['artist/junopark', 'junopark'])
  })

  it('Folders: the one music folder, then a folder with its path and songs', () => {
    const top = page.filesPage('folders', '', '')
    expect(kinds(top)).toEqual(['head', 'rows'])
    expect(head(top[0])).toMatchObject({ look: 'folder', title: 'm', meta: 'Music folder' })
    expect(head(top[0]).line).toEqual([{ text: '1 folder · 4 songs' }])
    const rows = top[1] as RowsBlock
    expect(rows.filtered).toBe(true)
    expect(rows.row(rows.items[0])).toMatchObject({ title: 'Rock', meta: '4 songs' })
    expect(rows.row(rows.items[0]).subtitle).toBeUndefined()
    // the song playing is in it
    const rockRow = rows.row(rows.items[0]) as PageRow
    expect(rockRow.playing?.('files:b1')).toBe(true)
    expect(rockRow.playing?.('radio:x')).toBe(false)
    const [m, rock, live] = files.folders.nodes.map((n) => n.key)
    const blocks = page.filesPage('folders', `folder/${live}`, '')
    expect(kinds(blocks)).toEqual(['tree', 'head', 'rows', 'songs'])
    expect(blocks[0].kind === 'tree' && blocks[0].path).toEqual([
      { title: 'm', hint: m, to: at(`folder/${m}`), here: false },
      { title: 'Rock', hint: 'Rock', to: at(`folder/${rock}`), here: false },
      { title: 'Live', hint: 'Live', to: at(`folder/${live}`), here: true }
    ])
    expect(songs(blocks[3])).toMatchObject({
      items: ['files:a3', 'files:b1'],
      label: 'Songs in this folder',
      sort: null
    })
  })

  it('Folders: a search that finds nothing says so', () => {
    const [, rock] = files.folders.nodes.map((n) => n.key)
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
    // the block reads the sort when drawn: the same block has the new one
    expect(songs(s).sort).toEqual({ k: 't', dir: 1 })
    page.filesAct('folders', 'sort', 'd')
    expect(files.folderSort).toEqual({ k: 'd', dir: 1 })
    page.filesAct('artist/junopark', 'sort', 'al')
    expect(files.artistSort).toEqual({ k: 'al', dir: 1 })
  })
})

describe('a grouped tag (ticket 068)', () => {
  // "Marina Vail" is grouped with "Marina Vale" by the artist groups task
  beforeEach(() => {
    const d = lib()
    const grouped = { artist: 'Marina Vale', artistTag: 'Marina Vail', grouped: true as const }
    d.albums.push(album('c', ['c1'], grouped))
    d.tracks.push(track('c1', 'c', grouped))
    files.load(d)
  })

  it('is marked "(grouped)" under the name, with Use tag', () => {
    const [h] = page.filesPage('artists', 'artist/marinavale', '')
    expect(head(h).note).toEqual({
      text: 'From tags:',
      items: [
        { text: 'Marina Vale' },
        {
          text: 'Marina Vail (grouped)',
          action: { id: 'use-tag', label: 'Use tag', value: 'marinavail' }
        }
      ]
    })
  })

  it("Use tag saves the tag's own name, so the group can't take it again", () => {
    page.filesAct('artist/marinavale', 'use-tag', 'marinavail')
    const sent = api.setArtists.mock.calls[0][0] as Record<string, null>
    expect(sent).toEqual({ marinavail: null })
    // the library built from artists.json with that change, the AI on
    const f: ArtistsFile = {
      artists: [{ name: 'Marina Vale', nameBy: 'ai', tags: [{ tag: 'Marina Vail', by: 'ai' }] }]
    }
    applyChanges(f, sent, (k) => (k === 'marinavail' ? 'Marina Vail' : undefined))
    const d = lib()
    const credit = creditOf('Marina Vail', resolve(f, true))
    d.albums.push(album('c', ['c1'], credit))
    d.tracks.push(track('c1', 'c', credit))
    files.load(d)
    // its own artist, from the tag as it is: no "From tags" line to undo it
    const [h] = page.filesPage('artists', 'artist/marinavail', '')
    expect(head(h).title).toBe('Marina Vail')
    expect(head(h).note).toBeUndefined()
    expect(files.getArtist('marinavale')?.tags).toEqual([
      { key: 'marinavale', name: 'Marina Vale' }
    ])
  })
})
