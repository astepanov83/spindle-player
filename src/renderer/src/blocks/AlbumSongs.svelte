<!-- An artist's albums with their songs (ticket 100): under each part's
     heading, every album's cover beside its title, counts, Play and songs.
     The cover stays in view while that album's songs scroll. Only the rows
     near the view are drawn. The songs of every album are one list for the
     keys and for selecting, so Shift+click runs from one album into the
     next. -->
<script lang="ts">
  import type { PluginId } from '../../../shared/plugins'
  import type { ItemKey } from '../../../shared/plugins/items'
  import {
    albumSongRows,
    albumsIn,
    coverPlace,
    scrollRow,
    sideRoom,
    type AlbumRow
  } from '../library/album-song-rows'
  import { dragSongs } from '../library/drag-songs'
  import { openSongMenu } from '../library/song-menu'
  import Cover from '../ui/Cover.svelte'
  import Eq from '../ui/Eq.svelte'
  import { addFinder } from '../ui/item-finder'
  import { roving } from '../ui/roving'
  import { listRows } from '../ui/selection'
  import { virtualList } from '../ui/virtual-list.svelte'
  import { openFrom } from '../plugins'
  import type { AlbumSongs, AlbumSongsBlock } from '../plugins/types'
  import { player } from '../stores/player.svelte'
  import { queue } from '../stores/queue.svelte'
  import { rowSelection } from '../stores/selection.svelte'
  import { songDrag, type DragSongs } from '../stores/song-drag.svelte'
  import { theme } from '../stores/theme.svelte'
  import { playPage, playState } from './page-play'
  import SongRow from './SongRow.svelte'
  import { tileMenu, tilePlaying, tilePress, unlessDragged } from './tile-acts'

  let {
    block: b,
    tab,
    plugin,
    scrollEl
  }: {
    block: AlbumSongsBlock
    tab: string
    plugin: PluginId
    scrollEl: HTMLElement | undefined
  } = $props()

  let list: HTMLDivElement | undefined = $state()
  let width = $state(0)

  const cover = $derived(coverPlace(width))
  const albums = $derived(b.parts.flatMap((p) => p.albums))
  const layout = $derived(albumSongRows(b.parts, cover))
  const rows = $derived(layout.rows)

  // Every row's height is known, so none is measured. A new function sizes
  // every row again: a new layout, a cover beside or above.
  const size = $derived.by(() => {
    const s = layout.sizes
    return (i: number): number => s[i] ?? 0
  })
  const rowKey = $derived.by(() => {
    const r = rows
    return (i: number): string => r[i]?.key ?? `${i}`
  })
  const v = virtualList(() => ({ count: rows.length, scrollEl, list, size, key: rowKey }), 10)

  // so another look of the page can start at an album not drawn (ticket 095)
  $effect(() =>
    addFinder((key) => {
      const a = albums.findIndex((al) => al.key === key)
      return a < 0 ? undefined : v.startOf(layout.albumRow[a])
    })
  )

  // the covers of the albums with a row drawn
  const covers = $derived.by(() => {
    const drawn = v.items
    if (!cover.side || !drawn.length) return []
    return albumsIn(layout, drawn[0].index, drawn[drawn.length - 1].index)
  })
  // where an album's cover may go: from its title down to its last row
  const runTop = (a: number): number => layout.tops[layout.albumRow[a]] + layout.albumRoom[a]
  const runEnd = (a: number): number => layout.tops[layout.albumEnd[a]] ?? layout.total

  // Ctrl and Shift select songs across albums (ticket 086)
  const shown = $derived(listRows(layout.songs))
  const sel = rowSelection(
    () => shown,
    (keys) => keys
  )

  const albumOfSong = (song: number): AlbumSongs => {
    const r = rows[layout.songRow[song]]
    return albums[r && r.kind !== 'part' ? r.album : 0]
  }
  // "From" is the album's while the songs are of one album, else the artist's
  function origin(keys: ItemKey[]): { from: string; link: AlbumSongs['link'] } {
    const of = new Set(keys.map((k) => albumOfSong(shown.indexOf(k))))
    const [al] = of
    return of.size === 1 && al ? { from: al.from, link: al.link } : { from: b.from, link: b.link }
  }

  // a click plays the album from the song clicked, as on the album page
  function onrowclick(e: MouseEvent, r: Extract<AlbumRow, { kind: 'song' }>): void {
    if (songDrag.tookClick()) return
    if (sel.click(r.song, e)) return
    const al = albums[r.album]
    queue.playList(al.items, r.at, al.from, al.link)
  }

  // a drag takes the selected songs when the row is one of them (ticket 089)
  function dragOf(key: ItemKey): DragSongs {
    const keys = sel.has(key) ? sel.ids() : [key]
    return dragSongs(keys, origin(keys))
  }

  function onmenu(e: MouseEvent, song: number): void {
    const keys = sel.menu(song)
    openSongMenu(e, keys, origin(keys))
  }

  const tint = (al: AlbumSongs): string | undefined =>
    al.art?.palette[theme.light ? 'light' : 'dark'][0]
  const open = (al: AlbumSongs): (() => void) => unlessDragged(() => openFrom(tab, al.to))
</script>

{#snippet art(al: AlbumSongs)}
  <!-- the title opens it too, and is the one a screen reader needs -->
  <button class="cv" tabindex="-1" aria-hidden="true" onclick={open(al)}
    ><Cover src={al.art?.coverLarge || al.art?.cover} tint={tint(al)} lazy={false} /></button
  >
{/snippet}

<div
  class="albums"
  class:above={!cover.side}
  bind:clientWidth={width}
  style:--side="{sideRoom(cover)}px"
  style:--cover="{cover.size}px"
>
  <!-- The list is one Tab stop: the songs. An album's title and Play are
       for the pointer; Enter on a song plays its album from it. -->
  <div
    class="rows lines"
    bind:this={list}
    style:height="{v.total}px"
    use:roving={{
      rows: layout.songs,
      count: layout.songs.length,
      scrollTo: (i) => v.scrollToIndex(scrollRow(layout, i)),
      select: sel
    }}
  >
    {#each covers as a (albums[a].key)}
      {@const al = albums[a]}
      <div
        class="run"
        style:top="{runTop(a)}px"
        style:height="{runEnd(a) - runTop(a)}px"
        onpointerdown={(e) => tilePress(e, al, al.meta)}
        oncontextmenu={(e) => tileMenu(e, plugin, al.key, al)}
        role="presentation"
      >
        {@render art(al)}
      </div>
    {/each}
    {#each v.items as item (item.key)}
      {@const row = rows[item.index]}
      {#if row?.kind === 'part'}
        <div
          class="part"
          class:top={row.top}
          style:height="{item.size}px"
          style:transform="translateY({v.offset(item)}px)"
        >
          <h3 class="section-label">{row.title}</h3>
        </div>
      {:else if row?.kind === 'album'}
        {@const al = albums[row.album]}
        {@const on = tilePlaying(al)}
        <div
          class="line head"
          class:first={row.first}
          role="group"
          aria-label={al.title}
          data-item={al.key}
          style:height="{item.size}px"
          style:transform="translateY({v.offset(item)}px)"
          onpointerdown={(e) => tilePress(e, al, al.meta)}
          oncontextmenu={(e) => tileMenu(e, plugin, al.key, al)}
        >
          {#if !cover.side}{@render art(al)}{/if}
          <div class="words">
            <button class="title" tabindex="-1" title={al.title} onclick={open(al)}
              >{#if on}<Eq paused={!player.playing} />{/if}<span>{al.title}</span></button
            >
            <div class="page-meta">{al.meta}</div>
          </div>
          <button
            class="pill ghost play"
            tabindex="-1"
            aria-label="{playState(al.link, al.songs) === 'pause' ? 'Pause' : 'Play'} {al.title}"
            onclick={unlessDragged(() => playPage('all', al.songs, al.from, al.link))}
            >{playState(al.link, al.songs) === 'pause' ? 'Pause' : 'Play'}</button
          >
        </div>
      {:else if row?.kind === 'disc'}
        <div
          class="line disc section-label"
          class:first={row.first}
          style:height="{item.size}px"
          style:transform="translateY({v.offset(item)}px)"
        >
          {row.label}
        </div>
      {:else if row?.kind === 'song'}
        {@const al = albums[row.album]}
        {@const key = al.items[row.at]}
        <SongRow
          {key}
          no={al.numbers[row.at]}
          index={row.song}
          second={al.artist ? 'Artist' : undefined}
          selected={sel.has(key)}
          top={v.offset(item)}
          onpointerdown={(e) => songDrag.press(e, () => dragOf(key))}
          onclick={(e) => onrowclick(e, row)}
          oncontextmenu={(e) => onmenu(e, row.song)}
        />
      {/if}
    {/each}
  </div>
</div>

<style>
  .albums {
    position: relative;
  }
  .rows {
    position: relative;
  }
  .part,
  .line,
  .run {
    position: absolute;
    top: 0;
    left: var(--side);
    right: 0;
  }
  .part {
    left: 0;
    display: flex;
    align-items: flex-end;
  }
  .part h3 {
    margin: 0 0 14px;
  }
  /* The cover's column, from the album's title to its last row. Placed by
     top, not a transform: a sticky box keeps to its parent's place before
     transforms. */
  .run {
    left: 0;
    right: auto;
    width: var(--cover);
  }
  .cv {
    display: block;
    width: var(--cover);
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 12px 26px -12px var(--shadow);
  }
  /* stays in view while its songs scroll, and leaves with the last one */
  .run .cv {
    position: sticky;
    top: calc(12px - var(--scroll-pad-top, 20px));
  }
  .head {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 24px 0 0 14px;
    border-top: 1px solid var(--edge);
  }
  .head.first {
    padding-top: 0;
    border-top: none;
  }
  .above .head {
    padding-left: 0;
  }
  .words {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-family: var(--display);
    font-size: 20px;
    font-weight: 700;
    line-height: 1.25;
    text-align: left;
  }
  .title span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .title:hover span {
    text-decoration: underline;
  }
  .play {
    flex-shrink: 0;
    padding: 6px 14px;
    /* as wide for Pause as for Play */
    min-width: 5.2em;
  }
  .disc {
    display: flex;
    align-items: flex-end;
    padding: 0 14px 8px;
  }
</style>
