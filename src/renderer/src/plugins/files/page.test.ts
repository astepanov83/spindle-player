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
  added: 0,
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
      count: '2 albums'
    })
    // the one-line title row has no "Library" over it (ticket 095)
    expect(head(blocks[0]).meta).toBeUndefined()
    const t = tiles(blocks[1])
    expect(t.items).toBe(files.albums)
    const tile = t.tile(files.albums[0])
    expect(tile).toMatchObject({ title: 'Album a', subtitle: 'Marina Vale', to: at('album/a') })
    expect(tile.songs()).toEqual(['files:a1', 'files:a2', 'files:a3'])
    expect(tile.link).toEqual({ plugin: 'files', page: 'album/a' })
  })

  it('Albums: a sort on the head, kept in settings, and the plays sorts follow new plays (085)', async () => {
    const { settings } = await import('../../stores/settings.svelte')
    const { plays } = await import('../../stores/plays.svelte')
    const blocks = page.filesPage('albums', '', '')
    const choice = head(blocks[0]).choice
    expect(choice).toMatchObject({ id: 'sort', label: 'Sort albums', value: 'artist' })
    expect(choice?.menu).toEqual({ prefix: 'Sort:' })
    expect(choice?.options).toHaveLength(6)
    page.filesAct(head(blocks[0]).id, choice!.id, 'played')
    expect(settings.viewSorts).toEqual({ albums: 'played' })
    // nothing played yet: library order
    const ids = (): string[] =>
      tiles(page.filesPage('albums', '', '')[1]).items.map((al) => (al as Album).id)
    expect(ids()).toEqual(['a', 'b'])
    plays.load({ 'files:b1': { n: 1, last: 5 } })
    expect(ids()).toEqual(['b', 'a'])
    plays.load({ 'files:b1': { n: 1, last: 5 }, 'files:a2': { n: 1, last: 9 } })
    expect(ids()).toEqual(['a', 'b'])
    // a sort this version doesn't know is Artist
    page.filesAct('albums', 'sort', 'colour')
    expect(settings.viewSorts).toEqual({ albums: 'artist' })
  })

  it('Classic Songs: the table has Plays and Last played (085)', () => {
    expect(songs(page.filesPage('songs', '', '')[0]).plays).toBe(true)
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
    expect(tiles(blocks[1]).items).toEqual(files.artists)
    // everyone has an album, so there is nothing to choose
    expect(head(blocks[0]).choice).toBeUndefined()
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
    // so the core offers the wider searches in it (ticket 077)
    expect(page.filesPage('artists', '', 'nobody')[1]).toMatchObject({ nothingFound: true })
  })

  it('Artists shows album artists first, with a choice for all (ticket 081)', async () => {
    const { settings } = await import('../../stores/settings.svelte')
    settings.artistsShown = 'album'
    files.load({
      albums: [...lib().albums, album('v', ['v1'], { artist: 'Various Artists' })],
      tracks: [...lib().tracks, track('v1', 'v', { artist: 'DJ Sol' })],
      folders: lib().folders
    })
    const names = (blocks: Block[]): string[] =>
      (tiles(blocks.at(-1)!).items as { name: string }[]).map((a) => a.name)
    let blocks = page.filesPage('artists', '', '')
    expect(names(blocks)).toEqual(['Juno Park', 'Marina Vale', 'Various Artists'])
    expect(head(blocks[0]).count).toBe('3 artists')
    expect(head(blocks[0]).choice).toEqual({
      id: 'artists-shown',
      label: 'Artists to show',
      value: 'album',
      options: [
        { value: 'album', label: 'Album artists' },
        { value: 'all', label: 'All artists' }
      ]
    })
    page.filesAct('', 'artists-shown', 'all')
    expect(settings.artistsShown).toBe('all')
    blocks = page.filesPage('artists', '', '')
    expect(names(blocks)).toEqual(['DJ Sol', 'Juno Park', 'Marina Vale', 'Various Artists'])
    expect(head(blocks[0]).count).toBe('4 artists')
    expect(head(blocks[0]).choice?.value).toBe('all')
    // a wrong value changes nothing
    page.filesAct('', 'artists-shown', 'some')
    expect(settings.artistsShown).toBe('all')
    // a search looks at everyone whatever the choice, and hides it
    page.filesAct('', 'artists-shown', 'album')
    blocks = page.filesPage('artists', '', 'sol')
    expect(names(blocks)).toEqual(['DJ Sol'])
    expect(head(blocks[0]).count).toBe('1 artist')
    expect(head(blocks[0]).choice).toBeUndefined()
  })

  it('a look switch on the heads of Albums, Artists and an artist page, kept in settings (095)', async () => {
    const { settings } = await import('../../stores/settings.svelte')
    const icons = (h: HeadBlock): string[] => h.looks?.options.map((o) => o.icon) ?? []
    const albums = head(page.filesPage('albums', '', '')[0])
    expect(albums.looks).toMatchObject({ id: 'look', label: 'Albums look', value: 'grid' })
    expect(albums.looks?.options.map((o) => o.label)).toEqual(['Grid', 'List'])
    expect(icons(albums)).toEqual(['lookGrid', 'lookList'])
    // beside the sort, which stays
    expect(albums.choice?.id).toBe('sort')
    page.filesAct(albums.id, 'look', 'list')
    expect(settings.viewLooks).toEqual({ albums: 'list', artists: 'grid', artistPage: 'sections' })
    expect(head(page.filesPage('albums', '', '')[0]).looks?.value).toBe('list')

    const artists = head(page.filesPage('artists', '', '')[0])
    expect(artists.looks?.value).toBe('grid')
    expect(icons(artists)).toEqual(['lookGrid', 'lookShelves', 'lookList'])
    page.filesAct(artists.id, 'look', 'shelves')
    expect(settings.viewLooks.artists).toBe('shelves')
    // the filtered grid keeps the switch: it is the same view
    expect(head(page.filesPage('artists', '', 'juno')[0]).looks?.value).toBe('shelves')

    const artist = head(page.filesPage('artists', 'artist/marinavale', '')[0])
    expect(artist.looks?.options.map((o) => o.value)).toEqual(['sections', 'albums', 'column'])
    page.filesAct(artist.id, 'look', 'column')
    expect(settings.viewLooks.artistPage).toBe('column')

    // a look another view has, or none, changes nothing
    page.filesAct(albums.id, 'look', 'shelves')
    page.filesAct(artist.id, 'look', 'grid')
    page.filesAct(albums.id, 'look')
    expect(settings.viewLooks).toEqual({ albums: 'list', artists: 'shelves', artistPage: 'column' })
    // an album's page has no looks, under an artist or not
    expect(head(page.filesPage('albums', 'album/a', '')[0]).looks).toBeUndefined()
    expect(
      head(page.filesPage('artists', 'album/a/artist/marinavale', '')[0]).looks
    ).toBeUndefined()
    page.filesAct('album/a/artist/marinavale', 'look', 'sections')
    expect(settings.viewLooks.artistPage).toBe('column')
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
    expect(page.filesPage('folders', `folder/${rock}`, 'zzz')[2]).toMatchObject({
      nothingFound: true
    })
  })

  it("Classic's Songs: a search that finds nothing says so (ticket 077)", () => {
    const blocks = page.filesPage('songs', '', 'zzz')
    expect(kinds(blocks)).toEqual(['songs', 'empty'])
    expect(songs(blocks[0]).items).toEqual([])
    expect(blocks[1]).toMatchObject({ title: 'No matches', nothingFound: true })
    expect(kinds(page.filesPage('songs', '', 'juno'))).toEqual(['songs'])
  })

  it("Classic's Songs: every song in the library's sort, sorted through act", () => {
    const [s] = page.filesPage('songs', '', '')
    expect(songs(s)).toMatchObject({
      items: ['files:a1', 'files:a2', 'files:a3', 'files:b1'],
      meta: '',
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

  it('is marked "(joined by AI)" under the name, with Keep separate named for the tag', () => {
    const [h] = page.filesPage('artists', 'artist/marinavale', '')
    expect(head(h).note).toEqual({
      text: 'From tags:',
      items: [
        { text: 'Marina Vale' },
        {
          text: 'Marina Vail (joined by AI)',
          action: {
            id: 'keep-tag',
            label: 'Keep separate',
            value: 'marinavail',
            hint: 'Keep Marina Vail separate'
          }
        }
      ]
    })
  })

  it('Keep separate says so, and its Undo puts the AI link back', async () => {
    page.filesAct('artist/marinavale', 'keep-tag', 'marinavail')
    const { notice } = await import('../../stores/notice.svelte')
    expect(notice.text).toBe('Marina Vail is its own artist now')
    expect(notice.action?.label).toBe('Undo')
    notice.press()
    expect(api.setArtists.mock.calls.map((c) => c[0])).toEqual([
      { marinavail: null },
      { marinavail: { ai: ['Marina Vale'] } }
    ])
  })

  it('links the Artists head to the name fixes, which list it under Joined by AI', () => {
    const [h] = page.filesPage('artists', '', '')
    expect(head(h).line).toEqual([{ text: '1 name fix', to: at('name-fixes') }])
    const blocks = page.filesPage('artists', 'name-fixes', '')
    expect(kinds(blocks)).toEqual(['head', 'text', 'changes'])
    expect(head(blocks[0])).toMatchObject({ title: 'Name fixes', back: { to: at('') } })
    expect(blocks[1]).toEqual({ kind: 'text', text: 'Joined by AI' })
    expect(blocks[2]).toEqual({
      kind: 'changes',
      id: 'name-fixes',
      label: 'Joined by AI',
      rows: [
        {
          key: 'marinavail',
          from: 'Marina Vail',
          to: [{ text: 'Marina Vale', to: at('artist/marinavale') }],
          action: {
            id: 'undo-fix',
            label: 'Undo',
            value: 'marinavail',
            hint: 'Undo Marina Vail to Marina Vale'
          }
        }
      ]
    })
    page.filesAct('name-fixes', 'undo-fix', 'marinavail')
    expect(api.setArtists).toHaveBeenCalledWith({ marinavail: null })
  })

  it("Keep separate saves the tag's own name, so the group can't take it again", () => {
    page.filesAct('artist/marinavale', 'keep-tag', 'marinavail')
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

describe('name fixes with none', () => {
  beforeEach(() => files.load(lib()))

  it('has no link on the Artists head, and the page says what it lists', () => {
    expect(head(page.filesPage('artists', '', '')[0]).line).toBeUndefined()
    const blocks = page.filesPage('artists', 'name-fixes', '')
    expect(kinds(blocks)).toEqual(['head', 'empty'])
    // the AI task is off in this test, so the page says so
    expect(blocks[1]).toMatchObject({ text: expect.stringContaining('Fix artist names is off') })
  })

  it('offers the other artists to join in Edit, and says how', () => {
    files.editingArtist = 'marinavale'
    const e = head(page.filesPage('artists', 'artist/marinavale', '')[0]).edit
    expect(e?.suggest).toEqual(['Juno Park'])
    expect(e?.hint).toContain("Type another artist's name to join them.")
  })
})
