// The files plugin's pages as blocks (ticket 059): Songs, Albums, Artists,
// Folders and their pages, from the library store. The core draws them; what
// their buttons do comes back through filesAct.
import { artistKey, namesOf, type Artist, type ArtistTag } from '../../../../shared/artists'
import { cleanNames, editArtist, maxNameLength } from '../../../../shared/artist-overrides'
import type { Album, Art } from '../../../../shared/library'
import type { ItemKey } from '../../../../shared/plugins/items'
import { queueLink } from '../../../../shared/saved-queue'
import { fmtCount } from '../../format'
import { albumLabel, albumLines, albumLink } from '../../library/album'
import {
  artistCovers,
  artistLinks,
  artistPageSongs,
  artistSongs,
  filterArtists
} from '../../library/artists'
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
} from '../../library/folders'
import { libraryProblem, scanLine, settingsText, stoppedText } from '../../library/scan-text'
import { nextSort, songRows, type SortKey } from '../../library/views'
import { library } from '../../stores/library.svelte'
import {
  rowsBlock,
  tilesBlock,
  type Block,
  type EmptyBlock,
  type HeadBlock,
  type PageAddress,
  type Piece,
  type TilesBlock
} from '../types'
import { openArtist, showArtist, followArtist } from './nav'
import { albumPage, artistPage, folderPage, parsePage } from './pages'
import { trackKey, trackKeys, trackOf } from './tracks'

const files = (page: string): PageAddress => ({ plugin: 'files', page })

// the act targets that are no page
const songsTarget = 'songs'
const foldersTarget = 'folders'
const libraryTarget = 'library'

export function filesPage(tab: string, page: string, query: string): Block[] {
  if (!library.albums.length) return [noLibrary(false)]
  if (tab === 'songs') return [songsTable(query)]
  if (tab === 'albums') return albumsPage(page, query)
  if (tab === 'artists') return artistsPage(page, query)
  if (tab === 'folders') return foldersPage(page, query)
  return []
}

export function filesEmptyPlaylists(noPlaylists: boolean): EmptyBlock | undefined {
  return library.albums.length ? undefined : noLibrary(noPlaylists)
}

// What the library shows before there are any songs.
export function noLibrary(noPlaylists: boolean): EmptyBlock {
  const s = library.status
  const problem = libraryProblem(s, library.loadFailed)
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
  id: '',
  title,
  meta: 'Library',
  count
})

// Classic's Songs: every song, in the library's sort
function songsTable(query: string): Block {
  return {
    kind: 'songs',
    id: songsTarget,
    items: songRows(library.albums, (id) => library.track(id), query).map(trackKey),
    from: 'Songs',
    meta: 'Library',
    sort: library.sort
  }
}

function albumsPage(page: string, query: string): Block[] {
  // the results show over the grid or the open album (part C draws them)
  if (query.trim()) return [{ kind: 'view', view: 'search' }]
  const p = parsePage(page)
  if (p?.kind === 'album' && library.findAlbum(p.id))
    return albumBlocks(library.album(p.id), { label: 'All albums', to: files('') })
  return [
    listHead('Albums', fmtCount(library.albums.length, 'album', 'albums')),
    albumTiles(library.albums)
  ]
}

// Albums as covers. On an artist's page the line under names the year, and
// an album opens under the artist.
export function albumTiles(albums: Album[], under?: { artist: string }): TilesBlock {
  return tilesBlock<Album>({
    items: albums,
    key: (al) => albumPage(al.id),
    tile: (al) => ({
      title: al.title,
      subtitle: under ? (al.year ? String(al.year) : '') : al.artist,
      art: al,
      to: files(under ? artistPage(under.artist, al.id) : albumPage(al.id)),
      // the album of the song the queue plays (not while radio plays)
      playing: (key) => trackOf(key)?.albumId === al.id,
      songs: () => trackKeys(al.trackIds),
      from: al.title,
      link: albumLink(al)
    })
  })
}

const album = (id: string): Album => library.album(id)
const songArt = (id: string): Art => library.art(library.track(id))

// the artists of the song playing (not while radio plays): its album's and its own
function playsArtist(item: ItemKey, key: string): boolean {
  const t = trackOf(item)
  if (!t) return false
  return [...namesOf(library.album(t.albumId)), ...namesOf(t)].some((n) => artistKey(n) === key)
}

// albums, or songs for an artist with only songs on other albums
const artistCount = (a: Artist): string =>
  a.albums.length
    ? fmtCount(a.albums.length, 'album', 'albums')
    : fmtCount(a.also.length, 'song', 'songs')

export function artistTiles(artists: Artist[]): TilesBlock {
  return tilesBlock<Artist>({
    items: artists,
    round: true,
    key: (a) => artistPage(a.key),
    tile: (a) => ({
      title: a.name,
      subtitle: artistCount(a),
      photo: library.photos[a.key]?.cover,
      covers: artistCovers(a, album, songArt),
      to: files(artistPage(a.key)),
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
  const artist = open && library.getArtist(open.key)
  if (!query.trim() && open?.album && library.findAlbum(open.album))
    return albumBlocks(library.album(open.album), {
      label: artist?.name ?? 'All artists',
      to: files(artistPage(open.key))
    })
  if (!query.trim() && artist) return artistBlocks(artist)
  const shown = filterArtists(library.artists, query)
  return [
    listHead('Artists', fmtCount(shown.length, 'artist', 'artists')),
    ...(shown.length ? [] : [noMatches('No artist has that in their name.')]),
    artistTiles(shown)
  ]
}

function albumBlocks(al: Album, back: HeadBlock['back']): Block[] {
  const id = albumPage(al.id)
  const tracks = al.trackIds.map((t) => library.track(t))
  const items = trackKeys(al.trackIds)
  const link = albumLink(al)
  const minutes = Math.round(tracks.reduce((s, t) => s + t.duration, 0) / 60)
  // where the album is on disk; null while the folder table is not in yet
  const folder = commonFolder(
    library.folders,
    tracks.map((t) => t.folder)
  )
  const parts = folder === null ? undefined : folderParts(library.folders, folder)
  // one link per artist of a split credit
  const names = artistLinks(al, (key) => !!library.getArtist(key)).flatMap(
    ({ name, key }, i): Piece[] => [
      ...(i ? [{ text: ', ' }] : []),
      key ? { text: name, to: files(artistPage(key)) } : { text: name }
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
        folder: parts
      }
    ]
  }
  if (parts && folder !== null)
    head.where = {
      text: folderPath(parts),
      to: files(folderPage(library.folders.nodes[folder].key))
    }
  return [head, { kind: 'songs', id, items, from: al.title, link, numbers, groups }]
}

// their albums in order, then the "Also on" songs as sorted
const artistPlayIds = (a: Artist): ItemKey[] =>
  trackKeys(
    artistPageSongs(
      a,
      album,
      (id) => library.track(id),
      library.artistSort,
      (t) => library.order(t)
    )
  )

const tagNote = (t: ArtistTag): string =>
  !t.names ? '' : t.names.length > 1 ? ' (split)' : ' (renamed)'

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
    id,
    title: a.name,
    meta: 'Artist',
    art: {
      src: library.photos[a.key]?.coverLarge,
      round: true,
      covers: artistCovers(a, album, songArt)
    },
    back: { label: 'All artists', to: files('') },
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
  // tags are listed when an override changed one, or when there are several
  if (a.tags.length > 1 || a.tags.some((t) => t.names))
    head.note = {
      text: 'From tags:',
      items: a.tags.map((t) => ({
        text: t.name + tagNote(t),
        ...(t.names ? { action: { id: 'use-tag', label: 'Use tag', value: t.key } } : {})
      }))
    }
  if (library.editingArtist === a.key)
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
      sort: library.artistSort
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
  return folderPlaySongs(tree, shown, library.query, library.folderSort, (t) =>
    library.order(t)
  ).map(trackKey)
}

// The Folders view: a path bar, the subfolders, then the folder's own songs.
function foldersPage(page: string, query: string): Block[] {
  const tree = library.folders
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
        ...(tree.roots.length > 1 ? [{ title: 'Folders', to: files('') }] : []),
        ...path.map((i) => {
          const n = tree.nodes[i]
          return {
            title: n.name,
            hint: n.parent < 0 ? n.key : n.name,
            to: files(folderPage(n.key)),
            here: i === shown
          }
        })
      ]
    })
  blocks.push({
    kind: 'head',
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
          to: files(folderPage(f.key)),
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
      sort: library.folderSort
    })
  return blocks
}

// A block's button was used (see the blocks above for the targets).
export function filesAct(target: string, id: string, value?: string): void {
  if (id === 'add-folder') return void window.libraryApi.addFolder()
  if (id === 'sort' && value) return sortBy(target, value as SortKey)
  const p = parsePage(target)
  const a = p?.kind === 'artist' && !p.album ? library.getArtist(p.key) : undefined
  if (a) artistAct(a, id, value)
}

function sortBy(target: string, k: SortKey): void {
  const p = parsePage(target)
  if (target === songsTarget) library.sort = nextSort(library.sort, k)
  else if (target === foldersTarget || p?.kind === 'folder') library.sortFolder(k)
  else if (p?.kind === 'artist') library.sortArtist(k)
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
    library.editingArtist = a.key
  } else if (id === 'cancel') library.editingArtist = null
  else if (id === 'save') saveNames(a, value)
  else if (id === 'use-tag') {
    const t = a.tags.find((t) => t.key === value)
    if (!t) return
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
  library.editingArtist = null
  const changes = editArtist(a, names)
  if (!Object.keys(changes).length) return
  window.libraryApi.setArtists(changes)
  followArtist(artistKey(names[0]))
}
