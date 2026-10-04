// The MFP tab's pages as blocks (ticket 061): the episodes, newest first, and
// an episode with its songs at their guessed times. The search box filters
// the list in place; a song match shows under its episode.
import type { Episode, EpisodeSong } from '../../../../shared/plugins/mfp/mfp'
import type { ItemKey } from '../../../../shared/plugins/items'
import { queueLink, type QueueLink } from '../../../../shared/saved-queue'
import { fmtCount, fmtLength } from '../../format'
import { fold, foldQuery } from '../../library/views'
import { rowsBlock, type Block, type HeadBlock, type PageAddress, type SearchGroup } from '../types'
import { songKey } from './items'
import { episodeOf, episodePage } from './nav'
import { mfpLine } from './settings'
import { mfp } from './store.svelte'

const at = (page: string): PageAddress => ({ plugin: 'mfp', page })
const linkOf = (e: Episode): QueueLink => queueLink('episode', e.id)
const keysOf = (e: Episode): ItemKey[] => e.songs.map(songKey)
const startHint = 'Guessed start'

// folded once per object: a new list from main brings new objects
function foldedBy<T extends object>(text: (x: T) => string): (x: T) => string {
  const kept = new WeakMap<T, string>()
  return (x) => {
    let f = kept.get(x)
    if (f === undefined) kept.set(x, (f = fold(text(x))))
    return f
  }
}
// a song by its title or artist, an episode by its title or mixer
const songText = foldedBy((s: EpisodeSong) => s.title + '\n' + s.artist)
const episodeText = foldedBy((e: Episode) => e.title + ' ' + e.artist)

export function mfpPage(_tab: string, page: string, query: string): Block[] {
  const id = episodeOf(page)
  const ep = id ? mfp.episode(id) : undefined
  return ep ? episodeBlocks(ep, query) : listBlocks(query)
}

// "In MFP mixes" in the search results of the other tabs (ticket 052)
export function mfpSearch(query: string): SearchGroup[] {
  const s = foldQuery(query)
  const songs: ItemKey[] = []
  for (const e of mfp.episodes)
    for (const song of e.songs) if (songText(song).includes(s)) songs.push(songKey(song))
  return [{ id: 'mixes', title: 'In MFP mixes', songs }]
}

function listBlocks(query: string): Block[] {
  const status = mfp.status
  const head: HeadBlock = {
    kind: 'head',
    look: 'list',
    id: '',
    title: 'Music For Programming',
    meta: 'Online',
    count: fmtCount(mfp.episodes.length, 'episode', 'episodes'),
    // Settings has the "updated" line
    ...(status?.running || status?.error ? { hint: mfpLine(status, Date.now()) } : {})
  }
  if (!mfp.episodes.length)
    return [
      head,
      {
        kind: 'empty',
        id: '',
        title: 'No episodes yet',
        text: status?.running
          ? 'Reading musicforprogramming.net…'
          : 'They show here once musicforprogramming.net has been read. "Check for new episodes" in Settings tries again.'
      }
    ]
  const s = foldQuery(query)
  if (!s) return [head, episodeRows(mfp.episodes)]
  // an episode that matches shows alone; one with matching songs shows them under it
  const blocks: Block[] = [head]
  let run: Episode[] = []
  const flush = (): void => {
    if (run.length) blocks.push(episodeRows(run))
    run = []
  }
  for (const e of mfp.episodes) {
    if (episodeText(e).includes(s)) {
      run.push(e)
      continue
    }
    const found = e.songs.filter((song) => songText(song).includes(s))
    if (!found.length) continue
    run.push(e)
    flush()
    blocks.push(songsOf(e, found))
  }
  flush()
  if (blocks.length === 1)
    blocks.push({
      kind: 'empty',
      id: '',
      title: 'No matches',
      text: 'No episode, mixer or song has that in its name.'
    })
  return blocks
}

function episodeRows(list: Episode[]): Block {
  return rowsBlock<Episode>({
    rows: 'page',
    items: list,
    key: (e) => episodePage(e.id),
    row: (e) => ({
      title: e.title,
      art: mfp.art(e.id)?.cover,
      details: [e.year ? String(e.year) : '', fmtCount(e.songs.length, 'song', 'songs')],
      meta: fmtLength(e.length),
      to: at(episodePage(e.id)),
      playing: (key) => key.startsWith('mfp:') && mfp.song(key.slice(4))?.episode === e,
      songs: () => keysOf(e),
      from: e.title,
      link: linkOf(e)
    })
  })
}

// Some of an episode's songs, each with its number and guessed start. A
// click plays the whole episode from that song.
function songsOf(e: Episode, songs: EpisodeSong[]): Block {
  const place = (s: EpisodeSong): number => e.songs.indexOf(s)
  return {
    kind: 'songs',
    id: episodePage(e.id),
    items: songs.map(songKey),
    from: e.title,
    link: linkOf(e),
    numbers: songs.map((s) => place(s) + 1),
    starts: { at: songs.map((s) => s.start), hint: startHint },
    queue: keysOf(e)
  }
}

function episodeBlocks(e: Episode, query: string): Block[] {
  const id = episodePage(e.id)
  const items = keysOf(e)
  const link = linkOf(e)
  const s = foldQuery(query)
  // the search box filters the songs in place
  const shown = s ? e.songs.filter((song) => songText(song).includes(s)) : e.songs
  const head: HeadBlock = {
    kind: 'head',
    look: 'album',
    id,
    title: e.title,
    meta: 'Music For Programming',
    art: { src: mfp.art(e.id)?.coverLarge },
    back: { label: 'All episodes', to: at('') },
    line: [
      {
        text: [
          e.artist,
          e.year ? String(e.year) : '',
          fmtCount(e.songs.length, 'song', 'songs'),
          fmtLength(e.length)
        ]
          .filter(Boolean)
          .join(' · ')
      }
    ],
    link: { label: e.link.replace(/^https:\/\//, ''), url: e.link },
    note: { text: 'Song times are guessed: the site gives none.', items: [] },
    buttons: [
      // pauses and resumes while the queue plays it
      {
        play: 'all',
        label: 'Play',
        songs: () => items,
        from: e.title,
        link,
        primary: true,
        pauses: true
      },
      { play: 'shuffle', label: 'Shuffle', songs: () => items, from: e.title, link },
      { menu: 'playlist', label: 'Add to playlist', songs: () => items },
      {
        menu: 'songs',
        label: 'Play next, add to the queue or a playlist',
        songs: () => items,
        from: e.title,
        link
      }
    ]
  }
  return [head, songsOf(e, shown)]
}
