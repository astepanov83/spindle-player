<!-- The Folders view: a path bar, the subfolders, then the folder's own songs.
     Both lists draw only the rows on screen. -->
<script lang="ts">
  import Empty from './Empty.svelte'
  import SongTable from './SongTable.svelte'
  import Eq from '../ui/Eq.svelte'
  import Icon from '../ui/Icon.svelte'
  import Thumb from '../ui/Thumb.svelte'
  import { crumbs, filterFolder, folderPlaySongs, folderSongs, shownFolder } from './folders'
  import { virtualList } from '../ui/virtual-list.svelte'
  import { keepPlace } from '../ui/keep-place.svelte'
  import type { QueueLink } from '../../../shared/saved-queue'
  import { openPlaylistMenu, openSongMenu } from './song-menu'
  import { library } from '../stores/library.svelte'
  import { player } from '../stores/player.svelte'
  import { queue } from '../stores/queue.svelte'

  let { scrollEl }: { scrollEl: HTMLElement | undefined } = $props()

  const ROW = 56
  const tree = $derived(library.folders)
  const shown = $derived(shownFolder(tree, library.folder))
  const node = $derived(shown === null ? undefined : tree.nodes[shown])
  const title = $derived(node?.name ?? 'Folders')
  const path = $derived(shown === null ? [] : crumbs(tree, shown))
  const view = $derived(filterFolder(tree, shown, library.query))
  const total = $derived(
    node ? node.count : tree.roots.reduce((s, r) => s + tree.nodes[r].count, 0)
  )
  const subfolders = $derived(node ? node.children.length : tree.roots.length)
  // only when there is a folder above to go to
  const showPath = $derived(shown !== null && (path.length > 1 || tree.roots.length > 1))
  // the folders the playing song is in, marked in the list
  const playingIn = $derived(
    new Set(
      queue.current && tree.nodes[queue.current.folder] ? crumbs(tree, queue.current.folder) : []
    )
  )

  let list: HTMLDivElement | undefined = $state()
  const v = virtualList(() => ({ count: view.folders.length, scrollEl, list, size: ROW }), 6)
  // by key: a scan can number the folders again
  keepPlace(() => ({
    scrollEl,
    list,
    items: view.folders.map((i) => tree.nodes[i].key),
    per: 1,
    rowSize: ROW,
    key: (k: string) => k,
    source: library.revision
  }))

  const songIds = (i: number | null): string[] => folderSongs(tree, i).map((t) => t.id)
  const plural = (n: number, one: string, many: string): string =>
    `${n.toLocaleString()} ${n === 1 ? one : many}`

  // what is shown: search and the table's sort
  const playIds = (): string[] =>
    folderPlaySongs(tree, shown, library.query, library.folderSort, (t) => library.order(t)).map(
      (t) => t.id
    )

  // the top list of music folders has no key to open again
  const link = $derived<QueueLink | undefined>(node && { kind: 'folder', id: node.key })

  function play(shuffle: boolean): void {
    const ids = playIds()
    if (!ids.length) return
    if (shuffle) player.shuffle = true
    queue.playList(ids, shuffle ? Math.floor(Math.random() * ids.length) : 0, title, link)
  }
</script>

{#if showPath}
  <nav class="crumbs" aria-label="Folder path">
    {#if tree.roots.length > 1}
      <button class="crumb" onclick={() => library.openFolder(null)}>Folders</button>
    {/if}
    {#each path as i, n (i)}
      {#if n > 0 || tree.roots.length > 1}<span class="sep" aria-hidden="true">/</span>{/if}
      <button
        class="crumb"
        disabled={i === shown}
        title={tree.nodes[i].parent < 0 ? tree.nodes[i].key : undefined}
        onclick={() => library.openFolder(tree.nodes[i].key)}>{tree.nodes[i].name}</button
      >
    {/each}
  </nav>
{/if}
<div class="head">
  <div class="page-meta">
    {node ? (node.parent < 0 ? 'Music folder' : 'Folder') : 'Music folders'}
  </div>
  <h2 class="page-title">{title}</h2>
  <div class="page-meta">
    {[subfolders ? plural(subfolders, 'folder', 'folders') : '', plural(total, 'song', 'songs')]
      .filter(Boolean)
      .join(' · ')}
  </div>
  <div class="acts">
    <button class="pill" disabled={!total} onclick={() => play(false)}>Play</button>
    <button class="pill ghost" disabled={!total} onclick={() => play(true)}>Shuffle</button>
    <button
      class="pill ghost"
      aria-haspopup="menu"
      disabled={!total}
      onclick={(e) => openPlaylistMenu(e, playIds())}>Add to playlist</button
    >
    <button
      class="pill ghost more"
      aria-haspopup="menu"
      aria-label="More"
      title="Play next, add to the queue or a playlist"
      disabled={!total}
      onclick={(e) => openSongMenu(e, playIds(), { from: title, link })}
      ><Icon name="more" size={18} /></button
    >
  </div>
</div>

{#if library.query.trim() && !view.folders.length && !view.songs.length}
  <Empty
    title="No matches"
    text="Nothing in this folder or below it matches. Search looks at folder names and at song titles, artists and albums."
  />
{/if}

<div class="folders" bind:this={list} style:height="{v.total}px">
  {#each v.items as item (item.key)}
    {@const i = view.folders[item.index]}
    {@const f = tree.nodes[i]}
    <button
      class="row"
      class:first={item.index === 0}
      style:transform="translateY({v.offset(item)}px)"
      onclick={() => library.openFolder(f.key)}
      oncontextmenu={(e) =>
        openSongMenu(e, songIds(i), { from: f.name, link: { kind: 'folder', id: f.key } })}
    >
      <Thumb src={f.cover} size={40} radius={6} />
      <span class="nm">
        <span class="t"
          >{#if playingIn.has(i)}<Eq />{/if}<span>{f.name}</span></span
        >
        {#if f.parent < 0}<span class="where">{f.key}</span>{/if}
      </span>
      <span class="n">{plural(f.count, 'song', 'songs')}</span>
      <span class="go"><Icon name="back" size={16} /></span>
    </button>
  {/each}
</div>

{#if node && view.songs.length}
  {#if view.folders.length}<div class="gap"></div>{/if}
  <SongTable
    {title}
    meta="Folder"
    items={view.songs}
    {scrollEl}
    sort={library.folderSort}
    onsort={(k) => library.sortFolder(k)}
    {link}
  >
    {#snippet head()}
      <h3 class="songs">Songs in this folder</h3>
    {/snippet}
  </SongTable>
{/if}

<style>
  .crumbs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 4px;
    font-size: 13px;
    color: var(--ink-3);
    margin-top: 4px;
    min-height: 20px;
  }
  .crumb {
    color: var(--ink-3);
    padding: 1px 4px;
    margin: 0 -4px;
    border-radius: 5px;
    max-width: 32ch;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .crumb:hover:not(:disabled) {
    color: var(--ink);
    background: var(--hover);
  }
  .crumb:disabled {
    color: var(--ink-2);
    cursor: default;
  }
  .sep {
    opacity: 0.6;
    padding: 0 4px;
  }
  .head {
    padding: 8px 0 18px;
    margin-top: 4px;
    min-width: 0;
  }
  .head .page-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
  }
  .pill {
    padding: 8px 16px;
    border-radius: 99px;
    font-size: 14px;
    font-weight: 600;
    background: var(--ink);
    color: var(--bg);
  }
  .pill.ghost {
    background: var(--field);
    color: var(--ink);
  }
  .pill:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .folders {
    position: relative;
  }
  .row {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 56px;
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto 16px;
    gap: 14px;
    align-items: center;
    text-align: left;
    padding: 0 12px;
    border-radius: 10px;
    font-size: 15px;
    box-shadow: 0 -1px 0 var(--edge);
  }
  .row.first {
    box-shadow: none;
  }
  .row:hover {
    background: var(--hover);
  }
  .nm {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .t {
    display: flex;
    gap: 6px;
    align-items: center;
    min-width: 0;
  }
  .t span,
  .where {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .where {
    font-size: 12.5px;
    color: var(--ink-3);
  }
  .n {
    color: var(--ink-3);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  /* the back arrow turned around */
  .go {
    display: grid;
    color: var(--ink-3);
    transform: scaleX(-1);
  }
  .gap {
    height: 22px;
  }
  .songs {
    margin: 0;
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-3);
    font-weight: 600;
  }
</style>
