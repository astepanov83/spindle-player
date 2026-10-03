<!-- An artist: their picture and name, their albums as covers, then their
     songs on other albums in the song table. Edit renames or splits them
     (ticket 024). -->
<script lang="ts">
  import { queueLink } from '../../../shared/saved-queue'
  import { fmtCount } from '../format'
  import { untrack } from 'svelte'
  import { artistKey, type Artist, type ArtistTag } from '../../../shared/artists'
  import type { Album } from '../../../shared/library'
  import { cleanNames, editArtist, maxNameLength } from '../../../shared/artist-overrides'
  import AlbumGrid from './AlbumGrid.svelte'
  import ArtistPic from './ArtistPic.svelte'
  import SongTable from './SongTable.svelte'
  import Icon from '../ui/Icon.svelte'
  import { artistCovers, artistPageSongs, artistSongs } from './artists'
  import { openPlaylistMenu, openSongMenu } from './song-menu'
  import { trackKeys } from '../plugins/files/tracks'
  import { followArtist, openArtist, openArtistAlbum } from '../plugins/files/nav'
  import type { ItemKey } from '../../../shared/plugins/items'
  import { library } from '../stores/library.svelte'
  import { player } from '../stores/player.svelte'
  import { queue } from '../stores/queue.svelte'

  let { artist: a, scrollEl }: { artist: Artist; scrollEl: HTMLElement | undefined } = $props()

  const album = (id: string): Album => library.album(id)
  const albums = $derived(a.albums.map((id) => library.album(id)))
  const also = $derived(trackKeys(a.also))
  const songs = $derived(artistSongs(a, album))
  const covers = $derived(artistCovers(a, album, (id) => library.art(library.track(id))))

  // their albums in order, then the "Also on" songs as sorted
  const playIds = (): ItemKey[] =>
    trackKeys(
      artistPageSongs(
        a,
        album,
        (id) => library.track(id),
        library.artistSort,
        (t) => library.order(t)
      )
    )

  function play(shuffle: boolean): void {
    const ids = playIds()
    if (!ids.length) return
    if (shuffle) player.shuffle = true
    queue.playList(
      ids,
      shuffle ? Math.floor(Math.random() * ids.length) : 0,
      a.name,
      queueLink('artist', a.key)
    )
  }

  // the names in the editor: one renames, two or more split
  let draft: string[] = $state([])
  const editing = $derived(library.editingArtist === a.key)
  const canSave = $derived(cleanNames(draft).length > 0)
  // tags are listed when an override changed one, or when there are several
  const showTags = $derived(a.tags.length > 1 || a.tags.some((t) => t.names))

  // Starts when editing turns on (the grid's menu opens it too). Not again
  // while it is on: a scan's patch brings a new artist object every few seconds.
  let wasEditing = false
  $effect.pre(() => {
    const on = editing
    if (on && !wasEditing) draft = [untrack(() => a.name)]
    wasEditing = on
  })

  function save(): void {
    const names = cleanNames(draft)
    if (!names.length) return
    library.editingArtist = null
    const changes = editArtist(a, names)
    if (!Object.keys(changes).length) return
    window.libraryApi.setArtists(changes)
    followArtist(artistKey(names[0]))
  }

  function useTag(t: ArtistTag): void {
    window.libraryApi.setArtists({ [t.key]: null })
    // with no other tag, the artist becomes the tag again
    followArtist(a.tags.length > 1 ? a.key : t.key)
  }

  function onkeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') {
      library.editingArtist = null
      e.stopPropagation()
    }
  }

  function focus(node: HTMLInputElement, on: boolean): void {
    if (!on) return
    node.focus()
    node.select()
    // select() shows the end of a long name; its start reads better
    node.scrollLeft = 0
  }

  const tagNote = (t: ArtistTag): string =>
    !t.names ? '' : t.names.length > 1 ? ' (split)' : ' (renamed)'
</script>

<button class="back" onclick={() => openArtist(null)}
  ><Icon name="back" size={16} />All artists</button
>
<div class="head">
  <div class="pic"><ArtistPic photo={library.photos[a.key]?.coverLarge} {covers} /></div>
  <div class="about">
    <div class="page-meta">Artist</div>
    {#if editing}
      <div class="names">
        {#each draft.map((_, i) => i) as i (i)}
          <div class="name-row">
            <input
              class="page-title name"
              aria-label="Artist name {i + 1}"
              maxlength={maxNameLength}
              bind:value={draft[i]}
              use:focus={i === draft.length - 1}
              {onkeydown}
            />
            {#if draft.length > 1}
              <button
                class="x"
                aria-label="Remove this name"
                onclick={() => (draft = draft.filter((_, j) => j !== i))}
                ><Icon name="close" size={14} /></button
              >
            {/if}
          </div>
        {/each}
        <button class="add" onclick={() => (draft = [...draft, ''])}
          ><Icon name="plus" size={14} />Add artist</button
        >
        <div class="hint">
          Change the name to rename this artist. To split it into several, add a name for each.
        </div>
      </div>
    {:else}
      <h2 class="page-title" title={a.name}>{a.name}</h2>
    {/if}
    {#if showTags}
      <div class="tags">
        From tags:
        {#each a.tags as t, i (t.key)}
          {#if i > 0}<span class="dot">·</span>{/if}<span>{t.name}{tagNote(t)}</span>
          {#if t.names}
            <button class="use" onclick={() => useTag(t)}>Use tag</button>
          {/if}
        {/each}
      </div>
    {/if}
    <div class="page-meta">
      {[
        albums.length ? fmtCount(albums.length, 'album', 'albums') : '',
        fmtCount(songs.length, 'song', 'songs')
      ]
        .filter(Boolean)
        .join(' · ')}
    </div>
    <div class="acts">
      {#if editing}
        <button class="pill" disabled={!canSave} onclick={save}>Save</button>
        <button class="pill ghost" onclick={() => (library.editingArtist = null)}>Cancel</button>
      {:else}
        <button class="pill" onclick={() => play(false)}>Play</button>
        <button class="pill ghost" onclick={() => play(true)}>Shuffle</button>
        <button
          class="pill ghost"
          aria-haspopup="menu"
          onclick={(e) => openPlaylistMenu(e, playIds())}>Add to playlist</button
        >
        <button class="pill ghost" onclick={() => (library.editingArtist = a.key)}>Edit</button>
        <button
          class="pill ghost more"
          aria-haspopup="menu"
          aria-label="More"
          title="Play next, add to the queue or a playlist"
          onclick={(e) =>
            openSongMenu(e, playIds(), {
              from: a.name,
              link: queueLink('artist', a.key)
            })}><Icon name="more" size={18} /></button
        >
      {/if}
    </div>
  </div>
</div>

{#if albums.length}
  <h3 class="part section-label">Albums</h3>
  <AlbumGrid {scrollEl} items={albums} sub="year" onopen={(id) => openArtistAlbum(id)} />
{/if}

{#if also.length}
  <SongTable
    title={a.name}
    meta="Also on"
    items={also}
    {scrollEl}
    sort={library.artistSort}
    onsort={(k) => library.sortArtist(k)}
    link={queueLink('artist', a.key)}
    count={albums.length > 0}
  >
    <!-- with no albums above, "Also on" would head nothing, and the header
         already counts the songs -->
    {#snippet head()}
      {#if albums.length}<h3 class="part section-label">Also on</h3>{/if}
    {/snippet}
  </SongTable>
{/if}

<style>
  .back {
    font-size: var(--text-s);
    color: var(--ink-3);
    display: inline-flex;
    gap: 4px;
    align-items: center;
    margin-top: 4px;
  }
  .back:hover {
    color: var(--ink);
  }
  .head {
    display: flex;
    gap: 22px;
    align-items: flex-end;
    padding: 8px 0 22px;
    flex-wrap: wrap;
  }
  .about {
    min-width: 0;
    flex: 1 1 200px;
  }
  .head .page-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pic {
    width: 160px;
    aspect-ratio: 1;
    border-radius: 50%;
    box-shadow: 0 14px 30px -12px var(--shadow);
    flex: none;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 16px;
  }
  .names {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;
    margin-bottom: 12px;
  }
  .name-row {
    display: flex;
    gap: 6px;
    align-items: center;
    width: min(100%, 520px);
  }
  .name {
    flex: 1;
    min-width: 0;
    padding: 2px 6px;
    margin-left: -7px;
    color: var(--ink);
    background: var(--field);
    border: 1px solid var(--ring);
    border-radius: 8px;
    outline: none;
    box-shadow: none;
  }
  .x {
    color: var(--ink-3);
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    flex: none;
  }
  .x:hover {
    color: var(--ink);
    background: var(--field);
  }
  .add {
    font-size: var(--text-s);
    color: var(--ink-2);
    display: inline-flex;
    gap: 4px;
    align-items: center;
  }
  .add:hover {
    color: var(--ink);
  }
  .hint {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    column-gap: 5px;
    font-size: var(--text-s);
    color: var(--ink-3);
    margin: 2px 0 4px;
  }
  .use {
    font-size: var(--text-s);
    color: var(--ink-2);
    text-decoration: underline;
  }
  .use:hover {
    color: var(--ink);
  }
  .part {
    margin: 0 0 14px;
  }
  /* the table's own head sits on the same line as the song count */
  :global(.tblhead) .part {
    margin: 0;
  }
</style>
