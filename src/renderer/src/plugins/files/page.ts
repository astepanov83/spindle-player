// The files plugin's pages as blocks (ticket 059): Songs, Albums, Artists,
// Folders and their pages, from the library store. The core draws them; what
// their buttons do comes back through filesAct.
import { artistKey, namesOf, type Artist } from '../../../../shared/plugins/files/artists'
import { cleanNames, editArtist, maxNameLength } from '../../../../shared/plugins/files/artist-edit'
import type { Album, Art } from '../../../../shared/library'
import type { ItemKey } from '../../../../shared/plugins/items'
import { queueLink } from '../../../../shared/saved-queue'
import { fmtCount, fmtLength } from '../../format'
import { albumLabel, albumLines, albumLink } from './album'
import {
  allBy,
  artistCovers,
  artistLinks,
  artistPageSongs,
  artistSongs,
  albumArtists,
  filterArtists,
  shownArtists
} from './artists'
import {
  commonFolder,
  crumbs,
  filterFolder,
  folderParts,
  folderPath,
  folderPlaySongs,
  folderSongs,
  shownFolder,
  type FolderTree
} from './folders'
import { libraryProblem, scanLine, settingsText, stoppedText } from './scan-text'
import {
  filterAlbums,
  nextSort,
  searchSongs,
  songRows,
  type Sort,
  type SortKey
} from '../../library/views'
import { library } from '../../stores/library.svelte'
import { plays } from '../../stores/plays.svelte'
import { setViewSort, settings, viewSort } from '../../stores/settings.svelte'
import { artistsShownChoices, type ArtistsShown } from '../../../../shared/settings'
import { playsOf } from '../../library/plays'
import type { Plays } from '../../../../shared/plays'
import { albumSorts, albumsView, parseAlbumSort, sortAlbums, type AlbumSort } from './album-sort'
import { files } from './store.svelte'
import { lookId, lookSwitch, setViewLook, viewLook } from './looks'
import { notice } from '../../stores/notice.svelte'
import {
  listBlock,
  rowsBlock,
  shelvesBlock,
  tilesBlock,
  type Block,
  type EmptyBlock,
  type ListBlock,
  type HeadBlock,
  type PageAddress,
  type Piece,
  type ArtistHeading,
  type CoverArt,
  type SearchGroup,
  type ShelvesBlock,
  type Tile,
  type TileGroups,
  type TilesBlock
} from '../types'
import { albumGrouping, artistGrouping, type Grouping, type Heading } from '../../library/groups'
import { openArtist, showArtist, followArtist, goToFolder } from './nav'
import { albumPage, artistPage, fixesPage, folderPage, parsePage } from './pages'
import { fixCount, keepSeparate, nameFixes, tagNote, type NameFix } from './name-fixes'
import { ai } from '../../ai.svelte'
import { artistGroupsTask } from '../../../../shared/plugins/files/artists-file'
import { trackKey, trackKeys, trackOf } from './tracks'
import { artistParts, newest, theirSongs, topSongs, type ArtistParts } from './artist-parts'

const at = (page: string): PageAddress => ({ plugin: 'files', page })

// the act targets that are no page
const songsTarget = 'songs'
const foldersTarget = 'folders'
const libraryTarget = 'library'

export function filesPage(tab: string, page: string, query: string): Block[] {
  if (!files.albums.length) return [noLibrary(false)]
  if (tab === 'songs') return songsPage(query)
  if (tab === 'albums') return albumsPage(page, query)
  if (tab === 'artists') return artistsPage(page, query)
  if (tab === 'folders') return foldersPage(page, query)
  return []
}

export function filesEmptyPlaylists(noPlaylists: boolean): EmptyBlock | undefined {
  return files.albums.length ? undefined : noLibrary(noPlaylists)
}

// What the library shows before there are any songs.
export function noLibrary(noPlaylists: boolean): EmptyBlock {
  const s = files.status
  const problem = libraryProblem(s, files.loadFailed)
  const add = { label: 'Add music folder', id: 'add-folder' }
  const empty = (title: string, text: string, action = true): EmptyBlock => ({
    kind: 'empty',
    id: libraryTarget,
    title,
    text,
    ...(action ? { action: add } : {})
  })
  if (problem)
    return empty(problem === stoppedText ? 'Library stopped' : 'Library not loaded', problem, false)
  if (s.settingsUnreadable && !s.folders.length)
    return empty('Settings not loaded', settingsText, false)
  if (s.phase !== 'idle') return empty('Looking for music', scanLine(s), false)
  // Studio's Playlists chip says what it is for, not just "No music yet"
  if (noPlaylists)
    return empty(
      'No playlists yet',
      `A playlist is made from your songs. ${
        s.folders.length
          ? 'Spindle found none it can play yet.'
          : 'Add a folder with your music first.'
      } Then right-click a song and pick "New playlist".`
    )
  if (!s.folders.length)
    return empty(
      'No music yet',
      'Add a folder with your music. Spindle reads the songs in it, and checks it again each time it starts.'
    )
  const where = s.folders.length === 1 ? s.folders[0] : `${s.folders.length} folders`
  return empty('No songs found', `Spindle found no songs it can play in ${where}.`)
}

// the core adds a button for each other tab that searches wider (ticket 077)
const noMatches = (text: string): EmptyBlock => ({
  kind: 'empty',
  id: libraryTarget,
  title: 'No matches',
  text,
  nothingFound: true
})

const listHead = (id: string, title: string, count: string): HeadBlock => ({
  kind: 'head',
  look: 'list',
  id,
  title,
  count
})

// Classic's Songs: every song, in the library's sort. The sort is read when
// drawn, so a sort click doesn't build the 50k list again.
function songsPage(query: string): Block[] {
  const items = songRows(files.albums, (id) => files.track(id), query).map(trackKey)
  const table: Block = {
    kind: 'songs',
    id: songsTarget,
    items,
    from: 'Songs',
    // the one-line title row of every list view
    meta: '',
    plays: true,
    get sort() {
      return library.sort
    }
  }
  return items.length || !query.trim()
    ? [table]
    : [table, noMatches('No song has that in its title, artist or album.')]
}

function albumsPage(page: string, query: string): Block[] {
  // every plugin's results show over the grid or the open album (ticket 039)
  if (query.trim())
    return [{ kind: 'results', empty: 'No song, album or artist has that in its name.' }]
  const p = parsePage(page)
  if (p?.kind === 'album' && files.findAlbum(p.id))
    return albumBlocks(files.album(p.id), { label: 'All albums', to: at('') })
  const by = parseAlbumSort(viewSort(albumsView))
  return [
    {
      ...listHead(albumsView, 'Albums', fmtCount(files.albums.length, 'album', 'albums')),
      looks: lookSwitch('albums'),
      choice: {
        id: 'sort',
        label: 'Sort albums',
        value: by,
        options: albumSorts.map((o) => ({ value: o.id, label: o.label })),
        menu: { prefix: 'Sort:' }
      }
    },
    viewLook('albums') === 'list'
      ? albumRows(sortedAlbums(by), undefined, albumGroups(by))
      : albumTiles(sortedAlbums(by), undefined, albumGroups(by))
  ]
}

// Headings by the sort (ticket 096): an album artist over their albums, letters, decades.
function albumGroups(by: AlbumSort): TileGroups<Album> | undefined {
  const grouping = albumGrouping(by, Date.now())
  if (!grouping) return undefined
  return {
    grouping,
    strip: by === 'name' || by === 'artist',
    ...(by === 'artist' ? { artist: albumArtistHeading } : {})
  }
}

// up to 4 of the albums' covers
const albumCovers = (albums: readonly Album[]): CoverArt[] =>
  albums.filter((al) => al.cover).slice(0, 4)

// An album artist over their albums: their picture, the albums under it,
// and Play plays those. A split credit ("A, B") has no page of its own.
function albumArtistHeading(h: Heading, albums: readonly Album[]): ArtistHeading {
  const a = files.getArtist(artistKey(h.artist ?? h.title))
  return {
    sub: fmtCount(albums.length, 'album', 'albums'),
    photo: a && files.photos[a.key]?.cover,
    covers: a ? artistCovers(a, album, songArt) : albumCovers(albums),
    ...(a ? { to: at(artistPage(a.key)), link: queueLink('artist', a.key) } : {}),
    songs: () => trackKeys(albums.flatMap((al) => al.trackIds)),
    from: h.title
  }
}

// The last sort, kept while the albums, the sort and the plays are the same:
// the page is built again on every scan patch and search key.
let sorted: { albums: Album[]; by: AlbumSort; plays: Plays; out: Album[] } | undefined

function sortedAlbums(by: AlbumSort): Album[] {
  const albums = files.albums
  // only the play sorts read the plays, so only they sort again after a play
  const counts = by === 'played' || by === 'plays' ? plays.all : undefined
  const s = sorted
  if (s && s.albums === albums && s.by === by && (!counts || s.plays === counts)) return s.out
  const out = sortAlbums(albums, by, (al) => playsOf(trackKeys(al.trackIds), (k) => plays.of(k)))
  sorted = { albums, by, plays: plays.all, out }
  return out
}

// An album as a tile. On an artist's page the line under names the year, and
// the album opens under the artist.
function albumTile(al: Album, under?: { artist: string }): Tile {
  return {
    title: al.title,
    subtitle: under ? (al.year ? String(al.year) : '') : al.artist,
    art: al,
    to: at(under ? artistPage(under.artist, al.id) : albumPage(al.id)),
    // the album of the song the queue plays (not while radio plays)
    playing: (key) => trackOf(key)?.albumId === al.id,
    songs: () => trackKeys(al.trackIds),
    from: al.title,
    link: albumLink(al)
  }
}

// Albums as covers.
function albumTiles(
  albums: Album[],
  under?: { artist: string },
  groups?: TileGroups<Album>
): TilesBlock {
  return tilesBlock<Album>({
    items: albums,
    ...(groups ? { groups } : {}),
    key: (al) => albumPage(al.id),
    tile: (al) => albumTile(al, under)
  })
}

// Albums as rows (ticket 097): the artist under the title, a link to their
// page, then Year, Songs, Length. On an artist's page no artist line: the
// year is a column.
function albumRows(
  albums: Album[],
  under?: { artist: string },
  groups?: TileGroups<Album>
): ListBlock {
  return listBlock<Album>({
    items: albums,
    ...(groups ? { groups } : {}),
    title: 'Title',
    // room for "under a minute" and "1 h 15 min"
    cols: [
      { head: 'Year', width: 48 },
      { head: 'Songs', width: 56 },
      { head: 'Length', width: 104 }
    ],
    key: (al) => albumPage(al.id),
    row: (al) => {
      const year = al.year ? String(al.year) : ''
      const n = al.trackIds.length
      const length = fmtLength(al.trackIds.reduce((s, id) => s + files.track(id).duration, 0))
      // a split credit ("A, B") has no page
      const who = under ? undefined : files.getArtist(artistKey(al.artist))
      const sub = under ? undefined : al.artist
      return {
        ...albumTile(al, under),
        subtitle: sub,
        ...(who ? { subTo: at(artistPage(who.key)) } : {}),
        cols: [year, String(n), length],
        label: [al.title, sub, year, fmtCount(n, 'song', 'songs'), length]
          .filter(Boolean)
          .join(', ')
      }
    }
  })
}

const album = (id: string): Album => files.album(id)
const songArt = (id: string): Art => files.art(files.track(id))

// the artists of the song playing (not while radio plays): its album's and its own
function playsArtist(item: ItemKey, key: string): boolean {
  const t = trackOf(item)
  if (!t) return false
  return [...namesOf(files.album(t.albumId)), ...namesOf(t)].some((n) => artistKey(n) === key)
}

// albums, or songs for an artist with only songs on other albums
const artistCount = (a: Artist): string =>
  a.albums.length
    ? fmtCount(a.albums.length, 'album', 'albums')
    : fmtCount(a.also.length, 'song', 'songs')

const artistTile = (a: Artist): Tile => ({
  title: a.name,
  subtitle: artistCount(a),
  photo: files.photos[a.key]?.cover,
  covers: artistCovers(a, album, songArt),
  to: at(artistPage(a.key)),
  playing: (item) => playsArtist(item, a.key),
  songs: () => trackKeys(artistSongs(a, album)),
  from: a.name,
  link: queueLink('artist', a.key),
  actions: [{ id: 'edit', label: 'Edit artist' }]
})

function artistTiles(artists: Artist[], groups?: TileGroups<Artist>): TilesBlock {
  return tilesBlock<Artist>({
    items: artists,
    ...(groups ? { groups } : {}),
    round: true,
    key: (a) => artistPage(a.key),
    tile: artistTile
  })
}

// Artists as rows (ticket 097): the name, up to 6 covers of their newest
// albums, then Albums and Songs.
function artistRows(artists: Artist[], groups?: TileGroups<Artist>): ListBlock {
  return listBlock<Artist>({
    items: artists,
    ...(groups ? { groups } : {}),
    round: true,
    title: 'Name',
    cols: [
      { head: 'Albums', width: 64 },
      { head: 'Songs', width: 64 }
    ],
    key: (a) => artistPage(a.key),
    row: (a) => {
      const n = a.albums.length
      const songs = artistSongs(a, album).length
      return {
        ...artistTile(a),
        subtitle: undefined,
        // only covers, as the artist's picture takes them
        strip: newest(a.albums.map(album).filter((al) => al.cover)).slice(0, 6),
        cols: [n ? String(n) : '', String(songs)],
        under: artistCount(a),
        label: [a.name, n ? fmtCount(n, 'album', 'albums') : '', fmtCount(songs, 'song', 'songs')]
          .filter(Boolean)
          .join(', ')
      }
    }
  })
}

// An artist's heading over their shelf: their picture, count and play, as
// their tile.
function artistHeading(a: Artist): ArtistHeading {
  const t = artistTile(a)
  return {
    sub: artistCount(a),
    ...(t.photo ? { photo: t.photo } : {}),
    covers: t.covers ?? [],
    to: t.to,
    songs: t.songs,
    from: t.from,
    ...(t.link ? { link: t.link } : {})
  }
}

// Artists as shelves (ticket 098): each one's albums newest first, opening
// under them. An artist with no albums of their own has the albums they
// are on, with the album artist under each title.
function artistShelves(artists: Artist[], letters?: Grouping<Artist>): ShelvesBlock {
  return shelvesBlock<Artist>({
    items: artists,
    ...(letters ? { letters } : {}),
    key: (a) => artistPage(a.key),
    title: (a) => a.name,
    head: artistHeading,
    shelf: shelfOf
  })
}

// Each artist's shelf, made once: a shelf is asked on every draw and arrow
// key, and a big artist's albums take a sort. The store makes new artists
// when the songs change, so a kept shelf is never out of date.
const shelves = new WeakMap<Artist, Tile[]>()

function shelfOf(a: Artist): Tile[] {
  let tiles = shelves.get(a)
  if (tiles) return tiles
  const under = { artist: a.key }
  if (a.albums.length) tiles = newest(a.albums.map(album)).map((al) => albumTile(al, under))
  else {
    const on = [...new Set(a.also.map((id) => files.track(id).albumId))].map(album)
    tiles = newest(on).map((al) => ({ ...albumTile(al, under), subtitle: al.artist }))
  }
  shelves.set(a, tiles)
  return tiles
}

// the Album artists / All artists choice (ticket 081)
const artistsShownId = 'artists-shown'
// the Artists head's act target
const artistsView = 'artists'

// While searching, the grid shows over the open page, which comes back when
// the text is cleared.
function artistsPage(page: string, query: string): Block[] {
  const p = parsePage(page)
  const open = p?.kind === 'artist' ? p : undefined
  const artist = open && files.getArtist(open.key)
  if (!query.trim() && open?.album && files.findAlbum(open.album)) {
    const al = files.album(open.album)
    const theirs = artist && theirSongs(artist, al)
    return albumBlocks(
      al,
      { label: artist?.name ?? 'All artists', to: at(artistPage(open.key)) },
      theirs && artist ? { name: artist.name, ids: theirs } : undefined
    )
  }
  if (!query.trim() && artist) return artistBlocks(artist)
  if (!query.trim() && p?.kind === 'fixes') return fixesBlocks()
  const shown = shownArtists(files.artists, settings.artistsShown, query)
  const fixes = fixCount(nameFixes(files.artists))
  const head = listHead(artistsView, 'Artists', fmtCount(shown.length, 'artist', 'artists'))
  head.looks = lookSwitch('artists')
  if (fixes) head.line = [{ text: fmtCount(fixes, 'name fix', 'name fixes'), to: at(fixesPage) }]
  // not while searching, which looks at everyone; not when it would change nothing
  if (!query.trim() && albumArtists(files.artists).length < files.artists.length)
    head.choice = {
      id: artistsShownId,
      label: 'Artists to show',
      value: settings.artistsShown,
      options: [
        { value: 'album', label: 'Album artists' },
        { value: 'all', label: 'All artists' }
      ]
    }
  // letters over the whole list; a search's few names need none
  const groups = query.trim() ? undefined : { grouping: artistGrouping, strip: true }
  const look = viewLook('artists')
  return [
    head,
    ...(shown.length ? [] : [noMatches('No artist has that in their name.')]),
    look === 'list'
      ? artistRows(shown, groups)
      : look === 'shelves'
        ? artistShelves(shown, groups?.grouping)
        : // smaller than the search results' artists, so more fit in a row
          { ...artistTiles(shown, groups), small: true }
  ]
}

const showFolderId = 'show-folder'
const goFolderId = 'go-folder'

// Where an album is on disk: its folder and that folder's parts as
// folderParts gives them. None while the folder table is not in yet.
function albumFolder(al: Album): { at: number; parts: string[] } | undefined {
  const at = commonFolder(
    files.folders,
    al.trackIds.map((t) => files.track(t).folder)
  )
  return at === null ? undefined : { at, parts: folderParts(files.folders, at) }
}

// "Show in file manager" in an album's song menu (ticket 050)
async function showAlbumFolder(id: string): Promise<void> {
  const al = files.findAlbum(id)
  const where = al && albumFolder(al)
  if (!where) return
  if (!(await window.libraryApi.showFolder(where.parts)))
    notice.show(`Couldn't open ${folderPath(where.parts)}`)
}

// "Go to folder": the album's folder in Folders, as a link (Back returns)
function goToAlbumFolder(id: string): void {
  const al = files.findAlbum(id)
  const where = al && albumFolder(al)
  if (where) goToFolder(files.folders.nodes[where.at].key)
}

// `theirs`: opened under an artist with songs on it, which are marked
// (ticket 099), with a line that counts them and a Play for them alone.
function albumBlocks(
  al: Album,
  back: HeadBlock['back'],
  theirs?: { name: string; ids: string[] }
): Block[] {
  const id = albumPage(al.id)
  const tracks = al.trackIds.map((t) => files.track(t))
  const items = trackKeys(al.trackIds)
  const marked = theirs && trackKeys(theirs.ids)
  const link = albumLink(al)
  const length = tracks.reduce((s, t) => s + t.duration, 0)
  const where = albumFolder(al)
  // one link per artist of a split credit
  const names = artistLinks(al, (key) => !!files.getArtist(key)).flatMap(
    ({ name, key }, i): Piece[] => [
      ...(i ? [{ text: ', ' }] : []),
      key ? { text: name, to: at(artistPage(key)) } : { text: name }
    ]
  )
  const numbers: number[] = []
  const groups: { at: number; label: string }[] = []
  for (const line of albumLines(tracks)) {
    if ('disc' in line) groups.push({ at: numbers.length, label: `Disc ${line.disc}` })
    else numbers.push(line.no)
  }
  const head: HeadBlock = {
    kind: 'head',
    look: 'album',
    id,
    title: al.title,
    meta: albumLabel(al),
    // the path is wanted now and then, not on every visit: a tooltip, and
    // the menu goes there
    ...(where ? { metaHint: folderPath(where.parts) } : {}),
    art: { src: al.coverLarge },
    back,
    line: [
      ...names,
      { text: ` · ${fmtCount(tracks.length, 'song', 'songs')} · ${fmtLength(length)}` }
    ],
    buttons: [
      {
        play: 'all',
        label: 'Play',
        songs: () => items,
        from: al.title,
        link,
        primary: true
      },
      { play: 'shuffle', label: 'Shuffle', songs: () => items, from: al.title, link },
      { menu: 'playlist', label: 'Add to playlist', songs: () => items },
      {
        menu: 'songs',
        label: 'Play next, add to the queue or a playlist, go to its folder',
        songs: () => items,
        from: al.title,
        link,
        ...(where
          ? {
              actions: [
                { id: goFolderId, label: 'Go to folder' },
                { id: showFolderId, label: 'Show in file manager' }
              ]
            }
          : {})
      }
    ]
  }
  // on the line that counts them, not with the head's buttons: one more
  // there puts the last on a line of its own at Studio's usual width
  if (marked && theirs)
    head.note = {
      text: `${fmtCount(theirs.ids.length, 'song', 'songs')} by ${theirs.name}`,
      items: [
        { text: '', play: { label: 'Play their songs', songs: () => marked, from: al.title, link } }
      ]
    }
  return [
    head,
    {
      kind: 'songs',
      id,
      items,
      from: al.title,
      link,
      numbers,
      groups,
      artist: !allBy(tracks, al.artist),
      ...(marked ? { marked } : {})
    }
  ]
}

// Their albums in order, then their songs on other albums: as the "Also
// on" table sorts them, or in library order on a page without it.
const artistPlayIds = (a: Artist, sort: Sort | null): ItemKey[] =>
  trackKeys(
    artistPageSongs(
      a,
      album,
      (id) => files.track(id),
      sort,
      (t) => files.order(t)
    )
  )

// An artist: their head, then their page in the look picked (ticket 099).
// Edit renames or splits them (ticket 024).
function artistBlocks(a: Artist): Block[] {
  if (viewLook('artistPage') === 'sections') return artistSections(a)
  const albums = a.albums.map(album)
  const also = trackKeys(a.also)
  const blocks: Block[] = [artistHead(a, () => artistPlayIds(a, files.artistSort))]
  if (albums.length)
    blocks.push({ kind: 'text', text: 'Albums' }, albumTiles(albums, { artist: a.key }))
  if (also.length)
    blocks.push({
      kind: 'songs',
      id: artistPage(a.key),
      items: also,
      from: a.name,
      link: queueLink('artist', a.key),
      // with no albums above, "Also on" would head nothing, and the head
      // already counts the songs
      ...(albums.length ? { label: 'Also on' } : {}),
      count: albums.length > 0,
      artist: !allBy(
        a.also.map((t) => files.track(t)),
        a.name
      ),
      get sort() {
        return files.artistSort
      }
    })
  return blocks
}

// The sections look: their most played songs, then their releases in parts
// as smaller covers.
function artistSections(a: Artist): Block[] {
  const parts = artistPartsOf(a)
  return [
    artistHead(a, () => artistPlayIds(a, null)),
    ...topSongsBlocks(a),
    ...partBlocks('Albums', partTiles(a, parts.albums)),
    ...partBlocks('Singles and EPs', partTiles(a, parts.singles)),
    ...partBlocks('Appears on', partTiles(a, parts.appearsOn, true))
  ]
}

// Their releases in parts, newest first: albums, singles and EPs, and the
// albums of others their songs are on.
const artistPartsOf = (a: Artist): ArtistParts =>
  artistParts(a, album, (id) => files.track(id).albumId)

// A part of an artist's page under its heading; nothing when it is empty.
function partBlocks(title: string, b: Block & { items: readonly unknown[] }): Block[] {
  return b.items.length ? [{ kind: 'text', text: title, part: true }, b] : []
}

// A part's albums as covers, opening under the artist. On another artist's
// album the line under names that artist, not the year.
function partTiles(a: Artist, albums: Album[], others = false): TilesBlock {
  const under = { artist: a.key }
  return {
    ...tilesBlock<Album>({
      items: albums,
      key: (al) => albumPage(al.id),
      tile: (al) => ({ ...albumTile(al, under), ...(others ? { subtitle: al.artist } : {}) })
    }),
    small: true
  }
}

// Their 5 most played songs, most first, with the album in the artist's
// place; nothing while none of their songs was played.
function topSongsBlocks(a: Artist): Block[] {
  const top = topSongs(trackKeys(artistSongs(a, album)), (k) => plays.of(k))
  if (!top.length) return []
  return partBlocks('Top songs', {
    kind: 'songs',
    id: artistPage(a.key),
    items: top,
    from: a.name,
    link: queueLink('artist', a.key),
    album: true
  })
}

// An artist's head: their picture, name and counts, Play, Shuffle, Add to
// playlist, Edit and the song menu, the tags they come from, the names
// editor while editing.
function artistHead(a: Artist, playIds: () => ItemKey[]): HeadBlock {
  const albums = a.albums.length
  const songs = artistSongs(a, album)
  const link = queueLink('artist', a.key)
  const head: HeadBlock = {
    kind: 'head',
    look: 'artist',
    id: artistPage(a.key),
    title: a.name,
    meta: 'Artist',
    art: {
      src: files.photos[a.key]?.coverLarge,
      round: true,
      covers: artistCovers(a, album, songArt)
    },
    back: { label: 'All artists', to: at('') },
    looks: lookSwitch('artistPage'),
    line: [
      {
        text: [
          albums ? fmtCount(albums, 'album', 'albums') : '',
          fmtCount(songs.length, 'song', 'songs')
        ]
          .filter(Boolean)
          .join(' · ')
      }
    ],
    buttons: [
      { play: 'all', label: 'Play', songs: playIds, from: a.name, link, primary: true },
      { play: 'shuffle', label: 'Shuffle', songs: playIds, from: a.name, link },
      { menu: 'playlist', label: 'Add to playlist', songs: playIds },
      { id: 'edit', label: 'Edit' },
      {
        menu: 'songs',
        label: 'Play next, add to the queue or a playlist',
        songs: playIds,
        from: a.name,
        link
      }
    ]
  }
  // tags are listed when a link changed one, or when there are several
  if (a.tags.length > 1 || a.tags.some((t) => t.names))
    head.note = {
      text: 'From tags:',
      items: a.tags.map((t) => ({
        text: t.name + tagNote(t),
        ...(t.names
          ? {
              action: {
                id: keepTagId,
                label: 'Keep separate',
                value: t.key,
                hint: `Keep ${t.name} separate`
              }
            }
          : {})
      }))
    }
  if (files.editingArtist === a.key)
    head.edit = {
      names: [a.name],
      label: 'Artist name',
      max: maxNameLength,
      add: 'Add artist',
      remove: 'Remove this name',
      hint: "Change the name to rename this artist. To split it into several, add a name for each. Type another artist's name to join them.",
      suggest: files.artists.filter((x) => x.key !== a.key).map((x) => x.name),
      // one renames, two or more split
      ok: (names) => cleanNames(names).length > 0
    }
  return head
}

const keepTagId = 'keep-tag'
const undoFixId = 'undo-fix'

// The names a fix shows now, each opening its artist's page.
function fixNames(f: NameFix): Piece[] {
  return f.names.flatMap((name, i): Piece[] => {
    const key = artistKey(name)
    return [
      ...(i ? [{ text: ', ' }] : []),
      files.getArtist(key) ? { text: name, to: at(artistPage(key)) } : { text: name }
    ]
  })
}

function fixRows(label: string, list: NameFix[]): Block[] {
  if (!list.length) return []
  return [
    { kind: 'text', text: label },
    {
      kind: 'changes',
      id: fixesPage,
      label,
      rows: list.map((f) => ({
        key: f.key,
        from: f.tag,
        to: fixNames(f),
        action: {
          id: undoFixId,
          label: 'Undo',
          value: f.key,
          hint: `Undo ${f.tag} to ${f.names.join(', ')}`
        }
      }))
    }
  ]
}

// Name fixes (ticket 074): every tag a link in artists.json shows under
// other names, the AI's and yours, each with Undo ("Keep separate").
function fixesBlocks(): Block[] {
  const f = nameFixes(files.artists)
  const n = fixCount(f)
  const aiOff = !ai.state?.tasks[artistGroupsTask]?.on
  const head: HeadBlock = {
    kind: 'head',
    look: 'folder',
    id: fixesPage,
    title: 'Name fixes',
    meta: 'Artists',
    back: { label: 'All artists', to: at('') },
    line: [
      {
        text: n
          ? fmtCount(n, 'tag', 'tags') + ' shown under other names'
          : 'No tag is shown under another name'
      }
    ]
  }
  const blocks: Block[] = [head]
  // its links are kept, but not used while it is off
  if (aiOff && !f.split.length && !f.joined.length)
    blocks.push({
      kind: 'empty',
      id: fixesPage,
      text: "Fix artist names is off in Settings, so it changes no names. Changes you make with Edit on an artist's page are listed here."
    })
  else if (!n)
    blocks.push({
      kind: 'empty',
      id: fixesPage,
      text: "When Fix artist names or Edit on an artist's page shows a tag under another name, it is listed here with Undo."
    })
  blocks.push(
    ...fixRows('Split by AI', f.split),
    ...fixRows('Joined by AI', f.joined),
    ...fixRows('Changed by you', f.yours)
  )
  return blocks
}

// "Keep separate" on a tag, from its artist's page or the name fixes, with a
// notice whose Undo puts the link back. `follow`: the page to show the
// artist on again after Undo, when Keep separate moved off it.
function keepTag(
  t: { key: string; name: string; names?: string[]; grouped?: true },
  follow?: string
): void {
  const c = keepSeparate(t)
  if (!c) return
  window.libraryApi.setArtists(c.keep)
  notice.show(`${t.name} is its own artist now`, {
    label: 'Undo',
    run: () => {
      window.libraryApi.setArtists(c.undo)
      if (follow && library.page('artists') === artistPage(t.key)) followArtist(follow)
    }
  })
}

// The open folder by its page: a folder that is gone shows the nearest one above.
function folderShown(tree: FolderTree, page: string): number | null {
  const p = parsePage(page)
  return shownFolder(tree, p?.kind === 'folder' ? p.key : null)
}

// the folders the playing song is in, marked in the list (not while radio plays)
function playingIn(tree: FolderTree, i: number, item: ItemKey): boolean {
  const t = trackOf(item)
  return !!t && !!tree.nodes[t.folder] && crumbs(tree, t.folder).includes(i)
}

// What a folder's Play plays: what is shown, with the search and the table's sort.
function folderPlayIds(tree: FolderTree, shown: number | null): ItemKey[] {
  return folderPlaySongs(tree, shown, library.query, files.folderSort, (t) => files.order(t)).map(
    trackKey
  )
}

// The Folders view: a path bar, the subfolders, then the folder's own songs.
function foldersPage(page: string, query: string): Block[] {
  const tree = files.folders
  const shown = folderShown(tree, page)
  const node = shown === null ? undefined : tree.nodes[shown]
  const id = node ? folderPage(node.key) : foldersTarget
  const title = node?.name ?? 'Folders'
  const path = shown === null ? [] : crumbs(tree, shown)
  const view = filterFolder(tree, shown, query)
  const total = node ? node.count : tree.roots.reduce((s, r) => s + tree.nodes[r].count, 0)
  const subfolders = node ? node.children.length : tree.roots.length
  // the top list of music folders has no key to open again
  const link = node && queueLink('folder', node.key)
  const playIds = (): ItemKey[] => folderPlayIds(tree, shown)
  const blocks: Block[] = []
  // only when there is a folder above to go to
  if (shown !== null && (path.length > 1 || tree.roots.length > 1))
    blocks.push({
      kind: 'tree',
      label: 'Folder path',
      path: [
        ...(tree.roots.length > 1 ? [{ title: 'Folders', to: at('') }] : []),
        ...path.map((i) => {
          const n = tree.nodes[i]
          return {
            title: n.name,
            hint: n.parent < 0 ? n.key : n.name,
            to: at(folderPage(n.key)),
            here: i === shown
          }
        })
      ]
    })
  blocks.push({
    kind: 'head',
    look: 'folder',
    id,
    title,
    meta: node ? (node.parent < 0 ? 'Music folder' : 'Folder') : 'Music folders',
    line: [
      {
        text: [
          subfolders ? fmtCount(subfolders, 'folder', 'folders') : '',
          fmtCount(total, 'song', 'songs')
        ]
          .filter(Boolean)
          .join(' · ')
      }
    ],
    buttons: [
      {
        play: 'all',
        label: 'Play',
        songs: playIds,
        from: title,
        link,
        primary: true,
        disabled: !total
      },
      { play: 'shuffle', label: 'Shuffle', songs: playIds, from: title, link, disabled: !total },
      { menu: 'playlist', label: 'Add to playlist', songs: playIds, disabled: !total },
      {
        menu: 'songs',
        label: 'Play next, add to the queue or a playlist',
        songs: playIds,
        from: title,
        link,
        disabled: !total
      }
    ]
  })
  if (query.trim() && !view.folders.length && !view.songs.length)
    blocks.push(
      noMatches(
        'Nothing in this folder or below it matches. Search looks at folder names and at song titles, artists and albums.'
      )
    )
  blocks.push(
    rowsBlock<number>({
      rows: 'page',
      items: view.folders,
      // by key: a scan can number the folders again
      key: (i) => tree.nodes[i].key,
      filtered: true,
      row: (i) => {
        const f = tree.nodes[i]
        return {
          title: f.name,
          ...(f.parent < 0 ? { subtitle: f.key } : {}),
          art: f.cover,
          meta: fmtCount(f.count, 'song', 'songs'),
          to: at(folderPage(f.key)),
          playing: (item) => playingIn(tree, i, item),
          songs: () => folderSongs(tree, i).map(trackKey),
          from: f.name,
          link: queueLink('folder', f.key)
        }
      }
    })
  )
  if (node && view.songs.length)
    blocks.push({
      kind: 'songs',
      id,
      items: view.songs.map(trackKey),
      from: title,
      link,
      label: 'Songs in this folder',
      get sort() {
        return files.folderSort
      }
    })
  return blocks
}

// What the search box finds in the music folders (ticket 039): songs by
// title or their own artist, albums, artists.
export function filesSearch(query: string): SearchGroup[] {
  return [
    {
      id: 'songs',
      title: 'Songs',
      songs: searchSongs(files.albums, (id) => files.track(id), query).map(trackKey)
    },
    { id: 'albums', title: 'Albums', tiles: albumTiles(filterAlbums(files.albums, query)) },
    { id: 'artists', title: 'Artists', tiles: artistTiles(filterArtists(files.artists, query)) }
  ]
}

// A block's button was used (see the blocks above for the targets).
export function filesAct(target: string, id: string, value?: string): void {
  if (id === 'add-folder') return void window.libraryApi.addFolder()
  if (id === 'sort' && value) return sortBy(target, value)
  if (id === lookId) return setLook(target, value)
  if (id === artistsShownId && artistsShownChoices.includes(value as ArtistsShown))
    return void (settings.artistsShown = value as ArtistsShown)
  const p = parsePage(target)
  if (p?.kind === 'album' && id === showFolderId) return void showAlbumFolder(p.id)
  if (p?.kind === 'album' && id === goFolderId) return goToAlbumFolder(p.id)
  if (p?.kind === 'fixes' && id === undoFixId) return undoFix(value)
  const a = p?.kind === 'artist' && !p.album ? files.getArtist(p.key) : undefined
  if (a) artistAct(a, id, value)
}

// A look picked in a head's switch (ticket 095). Not a step: like a sort.
function setLook(target: string, look: string | undefined): void {
  const p = parsePage(target)
  if (target === albumsView) setViewLook('albums', look)
  else if (target === artistsView) setViewLook('artists', look)
  else if (p?.kind === 'artist' && !p.album) setViewLook('artistPage', look)
}

function sortBy(target: string, k: string): void {
  const p = parsePage(target)
  if (target === albumsView) setViewSort(albumsView, parseAlbumSort(k))
  else if (target === songsTarget) library.sort = nextSort(library.sort, k as SortKey)
  else if (target === foldersTarget || p?.kind === 'folder') files.sortFolder(k as SortKey)
  else if (p?.kind === 'artist') files.sortArtist(k as SortKey)
}

function artistAct(a: Artist, id: string, value?: string): void {
  if (id === 'edit') {
    // from a tile: its page opens where the tile was, Artists or the search results
    const shown =
      library.tab === 'artists' &&
      library.page('artists') === artistPage(a.key) &&
      !library.query.trim()
    if (!shown && library.tab === 'artists') openArtist(a.key)
    else if (!shown) showArtist(a.key)
    files.editingArtist = a.key
  } else if (id === 'cancel') files.editingArtist = null
  else if (id === 'save') saveNames(a, value)
  else if (id === keepTagId) {
    const t = a.tags.find((t) => t.key === value)
    if (!t) return
    // with no other tag, the artist becomes the tag again
    const moves = a.tags.length < 2
    keepTag(t, moves ? a.key : undefined)
    followArtist(moves ? t.key : a.key)
  }
}

// Undo on a name fix: the tag as its own name, as Keep separate does.
function undoFix(key: string | undefined): void {
  for (const a of files.artists) {
    const t = a.tags.find((t) => t.key === key)
    if (t?.names) return keepTag(t)
  }
}

function saveNames(a: Artist, value: string | undefined): void {
  let list: unknown
  try {
    list = JSON.parse(value ?? '')
  } catch {
    return
  }
  const names = cleanNames(list)
  if (!names.length) return
  files.editingArtist = null
  const changes = editArtist(a, names)
  if (!Object.keys(changes).length) return
  window.libraryApi.setArtists(changes)
  followArtist(artistKey(names[0]))
}
