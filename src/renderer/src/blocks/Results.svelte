<!-- A results block: what each plugin that is on found for the search text
     (tickets 039, 059), group after group, each cut short with "Show all".
     Songs play with every song of their group as the queue. -->
<script lang="ts">
  import SearchButtons from './SearchButtons.svelte'
  import Tiles from './Tiles.svelte'
  import Empty from '../library/Empty.svelte'
  import SongTable from '../library/SongTable.svelte'
  import { openSongMenu } from '../library/song-menu'
  import Eq from '../ui/Eq.svelte'
  import Icon from '../ui/Icon.svelte'
  import Thumb from '../ui/Thumb.svelte'
  import { fmtTime } from '../format'
  import { roving, type RovingSelect } from '../ui/roving'
  import { infoOf } from '../plugins'
  import type { ShownTab } from '../plugins/tabs'
  import type { FoundGroup, ResultsBlock } from '../plugins/types'
  import type { ItemKey } from '../../../shared/plugins/items'
  import { library } from '../stores/library.svelte'
  import { queues } from '../stores/queues.svelte'
  import { queue } from '../stores/queue.svelte'
  import { rowSelection } from '../stores/selection.svelte'
  import { listRows } from '../ui/selection'

  // `wider`: the other tabs to search, under "No matches" or after the groups
  let {
    block: b,
    scrollEl,
    wider = []
  }: { block: ResultsBlock; scrollEl: HTMLElement | undefined; wider?: ShownTab[] } = $props()

  const TOP_SONGS = 8
  // 2, 3, 4 or 6 columns fill their rows
  const TOP_TILES = 12

  const q = $derived(library.query.trim())
  // a group shown whole stays while the text changes, also with nothing in it
  const whole = $derived(b.groups?.find((f) => f.key === library.searchAll))
  const from = $derived(`search "${q}"`)

  const size = (f: FoundGroup): number =>
    'songs' in f.group ? f.group.songs.length : f.group.tiles.items.length
  const groups = $derived((b.groups ?? []).filter((f) => size(f) > 0))
  const top = (f: FoundGroup): number => ('songs' in f.group ? TOP_SONGS : TOP_TILES)

  // the clicked song, with every song of its group found after it as the queue
  function play(keys: ItemKey[], i: number): void {
    queue.playList(keys, i, from)
  }

  // One selection over the songs shown in every group (ticket 086), so a
  // Shift+click can reach into the next group. A group's rows are numbered
  // from `at` in it.
  const songGroups = $derived.by(() => {
    let at = 0
    return groups.flatMap((f) => {
      if (!('songs' in f.group)) return []
      const keys = f.group.songs.slice(0, TOP_SONGS)
      const g = { key: f.key, keys, at }
      at += keys.length
      return [g]
    })
  })
  const shown = $derived(listRows(songGroups.flatMap((g) => g.keys)))
  const sel = rowSelection(
    () => shown,
    (keys) => keys
  )
  const startOf = (f: FoundGroup): number => songGroups.find((g) => g.key === f.key)?.at ?? 0

  function onrowclick(e: MouseEvent, f: FoundGroup, keys: ItemKey[], i: number): void {
    if (!sel.click(startOf(f) + i, e)) play(keys, i)
  }

  // the list keys of one group, in its own row numbers
  function selectIn(f: FoundGroup, keys: ItemKey[]): RovingSelect {
    return {
      step: (a, b) => sel.step(startOf(f) + a, startOf(f) + b),
      all: () => sel.only(keys.slice(0, TOP_SONGS)),
      clear: () => sel.clear()
    }
  }
</script>

{#snippet more(f: FoundGroup)}
  <div class="grouphead">
    <h3 class="part section-label">{f.group.title}</h3>
    {#if size(f) > top(f)}
      <button class="more" onclick={() => library.showAll(f.key)}>Show all {size(f)}</button>
    {/if}
  </div>
{/snippet}

{#snippet songList(f: FoundGroup, keys: ItemKey[])}
  <section class="songs">
    {@render more(f)}
    <!-- the heads every song list has (ticket 075); the rows say it all to a
         screen reader -->
    <div class="rhead song-head" aria-hidden="true">
      <span>Title</span>
      <span>Artist</span>
      <span class="al">Album</span>
      <span class="end">Time</span>
    </div>
    <div class="lines song-rows" use:roving={{ rows: keys, select: selectIn(f, keys) }}>
      {#each keys.slice(0, TOP_SONGS) as key, i (key)}
        {@const t = infoOf(key)}
        {@const cur = queues.isItem(key)}
        <button
          class="srow row"
          class:cur-row={cur}
          class:selected={sel.has(key)}
          data-row
          aria-current={cur ? 'true' : undefined}
          onclick={(e) => onrowclick(e, f, keys, i)}
          oncontextmenu={(e) => openSongMenu(e, sel.menu(startOf(f) + i), { from })}
        >
          <span class="tt">
            <Thumb src={t?.art?.cover} size={36} radius={4} />
            <span class="nm"
              >{#if cur && queues.songPlaying}<Eq />{/if}<span title={t?.title}
                >{t?.title ?? ''}</span
              ></span
            >
          </span>
          <span class="o" title={t?.subtitle}>{t?.subtitle ?? ''}</span>
          <span class="o al" title={t?.group}>{t?.group ?? ''}</span>
          <span class="d">{t?.length === undefined ? '' : fmtTime(t.length)}</span>
        </button>
      {/each}
    </div>
  </section>
{/snippet}

{#if whole}
  <button class="back" onclick={() => library.showAll(null)}
    ><Icon name="back" size={16} />All results</button
  >
  {#if 'songs' in whole.group}
    <SongTable
      title={whole.group.title}
      meta={`Search "${q}"`}
      items={whole.group.songs}
      {scrollEl}
    />
  {:else}
    <div class="allhead">
      <div class="page-meta">Search "{q}"</div>
      <h2 class="page-title">{whole.group.title}</h2>
    </div>
    <Tiles block={whole.group.tiles} tab={library.tab} plugin={whole.plugin} {scrollEl} />
  {/if}
{:else if !groups.length}
  {#if wider.length}
    <Empty title="No matches" text={b.empty}><SearchButtons tabs={wider} /></Empty>
  {:else}
    <Empty title="No matches" text={b.empty} />
  {/if}
{:else}
  {#each groups as f (f.key)}
    {#if 'songs' in f.group}
      {@render songList(f, f.group.songs)}
    {:else}
      <section>
        {@render more(f)}
        <Tiles
          block={{ ...f.group.tiles, items: f.group.tiles.items.slice(0, TOP_TILES) }}
          tab={library.tab}
          plugin={f.plugin}
          {scrollEl}
        />
      </section>
    {/if}
  {/each}
  {#if wider.length}<div class="wider"><SearchButtons tabs={wider} /></div>{/if}
{/if}

<style>
  section + section {
    margin-top: 14px;
  }
  .wider {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 22px;
  }
  .grouphead {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }
  .part {
    margin: 0;
  }
  .more {
    font-size: var(--text-s);
    color: var(--ink-2);
    padding: 4px 8px;
    margin-right: -8px;
    border-radius: 6px;
  }
  .more:hover {
    color: var(--ink);
    background: var(--hover);
  }
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
  .allhead {
    padding-bottom: 16px;
  }
  /* the song table's rows, with no number column */
  .rhead,
  .srow {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1.3fr) minmax(0, 1.3fr) 56px;
    gap: 16px;
    align-items: center;
    padding: 0 12px;
  }
  .rhead .end {
    text-align: right;
  }
  .srow {
    width: 100%;
    height: 54px;
    font-size: var(--text-l);
  }
  /* a narrow list drops the album; the album group is below */
  .songs {
    container-type: inline-size;
  }
  @container (max-width: 520px) {
    .rhead,
    .srow {
      grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr) 44px;
    }
    .al {
      display: none;
    }
  }
  .srow > span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tt {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--ink);
  }
  .nm {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .nm span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cur-row .nm {
    font-weight: 600;
  }
  .o {
    color: var(--ink-2);
  }
  .d {
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
    font-size: var(--text-m);
    text-align: right;
  }
</style>
