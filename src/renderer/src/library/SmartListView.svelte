<!-- A list that fills itself (ticket 118): its songs in a table, like a
     playlist, with Play, Shuffle and "Save as playlist". Read only. -->
<script lang="ts">
  import { untrack } from 'svelte'
  import SongTable from './SongTable.svelte'
  import SearchButtons from '../blocks/SearchButtons.svelte'
  import Icon from '../ui/Icon.svelte'
  import { openSongMenu } from './song-menu'
  import { filterItems, sortItems } from './views'
  import { heldRows, sameRows, smartList } from './smart-lists'
  import { infoOf, itemInfo, widerTabs } from '../plugins'
  import type { NavKind } from '../plugins/types'
  import { library, playlistsTab } from '../stores/library.svelte'
  import { loved } from '../stores/loved.svelte'
  import { playlists } from '../stores/playlists.svelte'
  import { plays } from '../stores/plays.svelte'
  import { smart } from '../stores/smart-lists.svelte'
  import { playPage, playState } from '../blocks/page-play'
  import { queueLink } from '../../../shared/saved-queue'
  import type { ItemKey } from '../../../shared/plugins/items'

  let {
    id,
    scrollEl,
    nav,
    back = false
  }: { id: string; scrollEl: HTMLElement | undefined; nav: NavKind; back?: boolean } = $props()

  const list = $derived(smartList(id))
  const live = $derived(list ? smart.items(list.id) : [])

  // The rows as they were when the list opened: a play or a heart elsewhere
  // doesn't move them under the user. Refresh takes the list as it is now.
  let held: ItemKey[] = $state.raw(untrack(() => live))
  $effect(() => {
    void id
    held = untrack(() => live)
  })
  const stay = (k: ItemKey): boolean => smart.has(k) && (id !== 'loved' || loved.has(k))
  const rows = $derived(heldRows(held, live, stay))
  // an empty list takes the first songs that come, once
  $effect(() => {
    if (!held.length && rows.length) held = rows
  })
  const changed = $derived(!sameRows(rows, live))

  // the search box filters the rows; Play takes what is shown
  const shown = $derived(filterItems(rows, library.query, infoOf))
  // the other tabs to search, while there is text (ticket 077)
  const wider = $derived(widerTabs(playlistsTab, nav))
  // its sort, kept with the playlists' while the app runs
  const sortId = $derived(`smart:${id}`)
  const link = $derived(queueLink('smart', id))
  // what the table shows, as sorted there
  const playIds = (): ItemKey[] =>
    sortItems(shown, library.playlistSort(sortId), infoOf, (k) => plays.of(k))

  function play(how: 'all' | 'shuffle'): void {
    if (list) playPage(how, playIds, link, (k) => itemInfo(k).state === 'ok')
  }

  function save(): void {
    if (list) playlists.saveAs(playIds(), list.name, (to) => library.showPlaylist(to))
  }

  function toList(): void {
    library.openSmartPage(null)
  }
</script>

{#if list}
  {#if back}
    <button class="back" onclick={toList}><Icon name="back" size={16} />All playlists</button>
  {/if}
  <SongTable
    title={list.name}
    meta="Made for you"
    items={shown}
    {scrollEl}
    sort={library.playlistSort(sortId)}
    onsort={(k) => library.sortPlaylist(sortId, k)}
    {link}
    plays={id === 'most' || id === 'forgotten'}
  >
    {#snippet head()}
      <div class="head">
        <!-- a change takes the place of what the list is, so nothing moves down -->
        <div class="page-meta auto" role="status">
          <Icon name="auto" size={14} />Made for you ·
          {#if changed}
            Changed since you opened it ·
            <button class="refresh" onclick={() => (held = live)}>Refresh</button>
          {:else}
            {list.about}
          {/if}
        </div>
        <h2 class="page-title clamp" title={list.name}>{list.name}</h2>
        <div class="acts">
          <button class="pill play" disabled={!shown.length} onclick={() => play('all')}
            >{playState(link, () => rows) === 'pause' ? 'Pause' : 'Play'}</button
          >
          <button class="pill ghost" disabled={!shown.length} onclick={() => play('shuffle')}
            >Shuffle</button
          >
          <button class="pill ghost" disabled={!shown.length} onclick={save}
            >Save as playlist</button
          >
          <button
            class="pill ghost more"
            aria-haspopup="menu"
            aria-label="More"
            title="Play next, add to the queue or a playlist"
            disabled={!shown.length}
            onclick={(e) => list && openSongMenu(e, playIds(), { link })}
            ><Icon name="more" size={18} /></button
          >
        </div>
      </div>
    {/snippet}
  </SongTable>
  {#if !rows.length}
    <p class="hint">{list.empty}</p>
  {:else if !shown.length}
    <p class="hint">No song in this list has that in its title, artist or album.</p>
  {/if}
  {#if rows.length && wider.length}
    <div class="wider" class:found={shown.length > 0}><SearchButtons tabs={wider} /></div>
  {/if}
{/if}

<style>
  .back {
    font-size: var(--text-s);
    color: var(--ink-3);
    display: inline-flex;
    gap: 4px;
    align-items: center;
    margin: 4px 0 12px;
  }
  .back:hover {
    color: var(--ink);
  }
  .head {
    min-width: 0;
  }
  .auto {
    display: flex;
    align-items: center;
    gap: 0 6px;
    flex-wrap: wrap;
  }
  /* as wide for Pause as for Play, so the pills beside it stay put */
  .play {
    min-width: 5.6em;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }
  .refresh {
    font: inherit;
    color: var(--ink-2);
    text-decoration: underline;
  }
  .refresh:hover {
    color: var(--ink);
  }
  .wider {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 0 12px;
  }
  .wider.found {
    padding: 22px 0 0;
  }
  .hint {
    color: var(--ink-3);
    font-size: var(--text-m);
    line-height: 1.6;
    padding: 20px 12px;
    max-width: 50ch;
  }
</style>
