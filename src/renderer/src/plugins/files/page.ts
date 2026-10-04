// The files plugin's pages as blocks (ticket 059): Songs, Albums, Artists,
// Folders and their pages, from the library store. The core draws them; what
// their buttons do comes back through filesAct.
import {
  artistKey,
  namesOf,
  type Artist,
  type ArtistTag
} from '../../../../shared/plugins/files/artists'
import { cleanNames, editArtist, maxNameLength } from '../../../../shared/plugins/files/artist-edit'
import type { Album, Art } from '../../../../shared/library'
import type { ItemKey } from '../../../../shared/plugins/items'
import { queueLink } from '../../../../shared/saved-queue'
import { fmtCount } from '../../format'
import { albumLabel, albumLines, albumLink } from './album'
import { artistCovers, artistLinks, artistPageSongs, artistSongs, filterArtists } from './artists'
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
import { filterAlbums, nextSort, searchSongs, songRows, type SortKey } from '../../library/views'
import { library } from '../../stores/library.svelte'
import { files } from './store.svelte'
import { notice } from '../../stores/notice.svelte'
import {
  rowsBlock,
  tilesBlock,
  type Block,
  type EmptyBlock,
  type HeadBlock,
  type PageAddress,
  type Piece,
  type SearchGroup,
  type TilesBlock
} from '../types'
import { openArtist, showArtist, followArtist } from './nav'
import { albumPage, artistPage, folderPage, parsePage } from './pages'
import { trackKey, trackKeys, trackOf } from './tracks'

const at = (page: string): PageAddress => ({ plugin: 'files', page })

// the act targets that are no page
const songsTarget = 'songs'
const foldersTarget = 'folders'
const libraryTarget = 'library'

export function filesPage(tab: string, page: string, query: string): Block[] {
  if (!files.albums.length) return [noLibrary(false)]
  if (tab === 'songs') return [songsTable(query)]
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

const noMatches = (text: string): EmptyBlock => ({
  kind: 'empty',
  id: libraryTarget,
  title: 'No matches',
  text
})

const listHead = (title: string, count: string): HeadBlock => ({
  kind: 'head',
  look: 'list',
  id: '',
  title,
  meta: 'Library',
  count
})

// Classic's Songs: every song, in the library's sort. The sort is read when
// drawn, so a sort click doesn't build the 50k list again.
function songsTable(query: string): Block {
  return {
    kind: 'songs',
    id: songsTarget,
    items: songRows(files.albums, (id) => files.track(id), query).map(trackKey),
    from: 'Songs',
    meta: 'Library',
    get sort() {
      return library.sort
    }
  }
}

function albumsPage(page: string, query: string): Block[] {
  // every plugin's results show over the grid or the open album (ticket 039)
  if (query.trim())
    return [{ kind: 'results', empty: 'No song, album or artist has that in its name.' }]
  const p = parsePage(page)
  if (p?.kind === 'album' && files.findAlbum(p.id))
    return albumBlocks(files.album(p.id), { label: 'All albums', to: at('') })
  return [
    listHead('Albums', fmtCount(files.albums.length, 'album', 'albums')),
    albumTiles(files.albums)
  ]
}

// Albums as covers. On an artist's page the line under names the year, and
// an album opens under the artist.
function albumTiles(albums: Album[], under?: { artist: string }): TilesBlock {
  return tilesBlock<Album>({
    items: albums,
    key: (al) => albumPage(al.id),
    tile: (al) => ({
      title: al.title,
      subtitle: under ? (al.year ? String(al.year) : '') : al.artist,
      art: al,
      to: at(under ? artistPage(under.artist, al.id) : albumPage(al.id)),
      // the album of the song the queue plays (not while radio plays)
      playing: (key) => trackOf(key)?.albumId === al.id,
      songs: () => trackKeys(al.trackIds),
      from: al.title,
      link: albumLink(al)
    })
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

function artistTiles(artists: Artist[]): TilesBlock {
  return tilesBlock<Artist>({
    items: artists,
    round: true,
    key: (a) => artistPage(a.key),
    tile: (a) => ({
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
  })
}

// While searching, the grid shows over the open page, which comes back when
// the text is cleared.
function artistsPage(page: string, query: string): Block[] {
  const p = parsePage(page)
  const open = p?.kind === 'artist' ? p : undefined
  const artist = open && files.getArtist(open.key)
  if (!query.trim() && open?.album && files.findAlbum(open.album))
    return albumBlocks(files.album(open.album), {
      label: artist?.name ?? 'All artists',
      to: at(artistPage(open.key))
    })
  if (!query.trim() && artist) return artistBlocks(artist)
  const shown = filterArtists(files.artists, query)
  return [
    listHead('Artists', fmtCount(shown.length, 'artist', 'artists')),
    ...(shown.length ? [] : [noMatches('No artist has that in their name.')]),
    artistTiles(shown)
  ]
}

const showFolderId = 'show-folder'

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

function albumBlocks(al: Album, back: HeadBlock['back']): Block[] {
  const id = albumPage(al.id)
  const tracks = al.trackIds.map((t) => files.track(t))
  const items = trackKeys(al.trackIds)
  const link = albumLink(al)
  const minutes = Math.round(tracks.reduce((s, t) => s + t.duration, 0) / 60)
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
    art: { src: al.coverLarge },
    back,
    line: [...names, { text: ` · ${tracks.length} songs · ${minutes} min` }],
    buttons: [
      // pauses and resumes while the queue plays it
      {
        play: 'all',
        label: 'Play',
        songs: () => items,
        from: al.title,
        link,
        primary: true,
        pauses: true
      },
      { play: 'shuffle', label: 'Shuffle', songs: () => items, from: al.title, link },
      { menu: 'playlist', label: 'Add to playlist', songs: () => items },
      {
        menu: 'songs',
        label: 'Play next, add to the queue or a playlist, show in file manager',
        songs: () => items,
        from: al.title,
        link,
        ...(where ? { actions: [{ id: showFolderId, label: 'Show in file manager' }] } : {})
      }
    ]
  }
  if (where)
    head.where = {
      text: folderPath(where.parts),
      to: at(folderPage(files.folders.nodes[where.at].key))
    }
  return [head, { kind: 'songs', id, items, from: al.title, link, numbers, groups }]
}

// their albums in order, then the "Also on" songs as sorted
const artistPlayIds = (a: Artist): ItemKey[] =>
  trackKeys(
    artistPageSongs(
      a,
      album,
      (id) => files.track(id),
      files.artistSort,
      (t) => files.order(t)
    )
  )

const tagNote = (t: ArtistTag): string =>
  t.grouped ? ' (grouped)' : !t.names ? '' : t.names.length > 1 ? ' (split)' : ' (renamed)'

// An artist: their picture and name, their albums as covers, then their
// songs on other albums. Edit renames or splits them (ticket 024).
function artistBlocks(a: Artist): Block[] {
  const id = artistPage(a.key)
  const albums = a.albums.map(album)
  const also = trackKeys(a.also)
  const songs = artistSongs(a, album)
  const link = queueLink('artist', a.key)
  const playIds = (): ItemKey[] => artistPlayIds(a)
  const head: HeadBlock = {
    kind: 'head',
    look: 'artist',
    id,
    title: a.name,
    meta: 'Artist',
    art: {
      src: files.photos[a.key]?.coverLarge,
      round: true,
      covers: artistCovers(a, album, songArt)
    },
    back: { label: 'All artists', to: at('') },
    line: [
      {
        text: [
          albums.length ? fmtCount(albums.length, 'album', 'albums') : '',
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
        ...(t.names ? { action: { id: 'use-tag', label: 'Use tag', value: t.key } } : {})
      }))
    }
  if (files.editingArtist === a.key)
    head.edit = {
      names: [a.name],
      label: 'Artist name',
      max: maxNameLength,
      add: 'Add artist',
      remove: 'Remove this name',
      hint: 'Change the name to rename this artist. To split it into several, add a name for each.',
      // one renames, two or more split
      ok: (names) => cleanNames(names).length > 0
    }
  const blocks: Block[] = [head]
  if (albums.length)
    blocks.push({ kind: 'text', text: 'Albums' }, albumTiles(albums, { artist: a.key }))
  if (also.length)
    blocks.push({
      kind: 'songs',
      id,
      items: also,
      from: a.name,
      link,
      // with no albums above, "Also on" would head nothing, and the head
      // already counts the songs
      ...(albums.length ? { label: 'Also on' } : {}),
      count: albums.length > 0,
      get sort() {
        return files.artistSort
      }
    })
  return blocks
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
  if (id === 'sort' && value) return sortBy(target, value as SortKey)
  const p = parsePage(target)
  if (p?.kind === 'album' && id === showFolderId) return void showAlbumFolder(p.id)
  const a = p?.kind === 'artist' && !p.album ? files.getArtist(p.key) : undefined
  if (a) artistAct(a, id, value)
}

function sortBy(target: string, k: SortKey): void {
  const p = parsePage(target)
  if (target === songsTarget) library.sort = nextSort(library.sort, k)
  else if (target === foldersTarget || p?.kind === 'folder') files.sortFolder(k)
  else if (p?.kind === 'artist') files.sortArtist(k)
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
  else if (id === 'use-tag') {
    const t = a.tags.find((t) => t.key === value)
    if (!t) return
    // saved as its own name, linked by you, so the AI never links it again
    window.libraryApi.setArtists({ [t.key]: null })
    // with no other tag, the artist becomes the tag again
    followArtist(a.tags.length > 1 ? a.key : t.key)
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
