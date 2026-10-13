// The Radio tab's "Heard on radio" page (ticket 119): the songs kept with the
// heart, newest first. A song in the library plays from its row and links to
// its album; one that is not offers the app's search and Copy. The heart lets
// one go, with Undo.
import type { ItemKey } from '../../../../shared/plugins/items'
import { heardKey, type HeardSong } from '../../../../shared/plugins/radio/heard'
import { songArt } from '../../../../shared/plugins/radio/stations'
import { pictureOf, type PictureArt } from '../../../../shared/library'
import { fmtCount } from '../../format'
import { heardAt } from '../../queue/history'
import { notice } from '../../stores/notice.svelte'
import { findSong, infoOf, openPage, pluginTabs, searchFor } from '../index'
import {
  rowsBlock,
  type Block,
  type HeadBlock,
  type ItemInfo,
  type ItemRow,
  type PageAddress
} from '../types'
import { heard, heardPage } from './heard.svelte'
import { radioPage } from './store.svelte'

// "21:14" today, "28 Sep" this year, "28 Sep 2025" before.
export function heardDate(at: number, now: number): string {
  const year = new Date(at).getFullYear()
  const day = heardAt(at, now)
  return year === new Date(now).getFullYear() ? day : `${day} ${year}`
}

// What the search box gets for a song not in the library: its title alone,
// so another spelling of the artist still finds it.
export const searchText = (s: HeardSong): string => s.song || s.raw

// "Iron Maiden - Powerslave", what Copy copies
export const copyText = (s: HeardSong): string =>
  s.artist && s.song ? `${s.artist} - ${s.song}` : s.song || s.raw

// A row's key: the radio's other rows are stations, whose ids have no colon.
const prefix = 'heard:'
export const heardRowKey = (s: HeardSong): string => prefix + heardKey(s.raw)
export const isHeardRow = (key: string): boolean => key.startsWith(prefix)

// The song in the library, matched by artist and title; none for a title
// with no artist.
const inLibrary = (s: HeardSong): ItemKey | undefined =>
  s.artist && s.song ? findSong(s.artist, s.song) : undefined

// The app can search the library: a plugin that is on searches wide.
const canSearch = (): boolean => pluginTabs().some((t) => t.searchWide && t.id !== 'radio')

export function heardBlocks(now = Date.now()): Block[] {
  const list = [...heard.songs].reverse()
  const found = new Map(list.map((s) => [s, inLibrary(s)]))
  const playable = list.map((s) => found.get(s)).filter((k): k is ItemKey => !!k)
  const owned = playable.length
  const head: HeadBlock = {
    kind: 'head',
    look: 'folder',
    id: heardPage,
    title: 'Heard on radio',
    meta: 'Radio',
    back: { label: 'Radio', to: radioPage },
    line: [
      {
        text: list.length
          ? fmtCount(list.length, 'song', 'songs') + (owned ? ` · ${owned} in your library` : '')
          : 'No songs yet'
      }
    ]
  }
  if (!list.length)
    return [
      head,
      {
        kind: 'empty',
        id: heardPage,
        text: 'While a station plays, press the heart next to a song to keep it here, with the station and the day.'
      }
    ]
  const search = canSearch()
  const queue = { items: playable }
  return [
    head,
    rowsBlock<HeardSong>({
      rows: 'item',
      items: list,
      key: heardRowKey,
      row: (s) => heardRow(s, found.get(s), queue, search, now)
    })
  ]
}

function heardRow(
  s: HeardSong,
  key: ItemKey | undefined,
  queue: ItemRow['queue'],
  search: boolean,
  now: number
): ItemRow {
  const info = key ? infoOf(key) : undefined
  const album = albumOf(info)
  const buttons: NonNullable<ItemRow['buttons']> = []
  const menu: NonNullable<ItemRow['menu']> = []
  if (album) {
    buttons.push({ id: 'album', label: 'Album', hint: `Go to ${info?.group || 'the album'}` })
    menu.push({ id: 'album', label: 'Go to album' })
  } else if (!key && search) {
    const hint = `Search your library for "${searchText(s)}"`
    buttons.push({ id: 'search', label: 'Search', hint })
    menu.push({ id: 'search', label: 'Search your library' })
  }
  if (!key) buttons.push({ id: 'copy', label: 'Copy', hint: `Copy "${copyText(s)}"` })
  menu.push({ id: 'copy', label: 'Copy title' }, { id: 'remove', label: 'Remove' })
  return {
    title: s.song || s.raw,
    ...(s.artist ? { subtitle: s.artist } : {}),
    art: s.art ? songArt(s.art).cover : info?.art?.cover || undefined,
    made: madeArt(s, info),
    details: [s.station],
    meta: heardDate(s.at, now),
    ...(key ? { play: key, queue } : {}),
    buttons,
    star: { on: true, label: 'Remove from Heard on radio', heart: true },
    menu
  }
}

// The song's album, at its row.
const albumOf = (info: ItemInfo | undefined): PageAddress | undefined =>
  info?.titleTo ?? info?.groupTo

// With no cover: the library song's own picture, else one made from the title.
function madeArt(s: HeardSong, info: ItemInfo | undefined): PictureArt {
  if (info?.art) return pictureOf(info.art)
  return {
    seed: heardKey(s.raw),
    title: s.song || s.raw,
    ...(s.artist ? { artist: s.artist } : {})
  }
}

// A row's buttons, heart and menu.
export function actOnHeard(rowKey: string, actionId: string): void {
  const s = heard.songs.find((x) => heardRowKey(x) === rowKey)
  if (!s) return
  if (actionId === 'star' || actionId === 'remove') return void heard.remove(s.raw)
  if (actionId === 'copy') return void copy(copyText(s))
  if (actionId === 'search') return void searchFor(searchText(s), 'radio')
  if (actionId === 'album') {
    const key = inLibrary(s)
    const to = albumOf(key ? infoOf(key) : undefined)
    if (to) openPage(to)
  }
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    notice.show(`Copied "${text}"`)
  } catch (e) {
    window.playbackApi.log(`Could not copy: ${String(e)}`)
    notice.show("Couldn't copy the title")
  }
}
