<!-- A songs block. With a sort it is the sortable song table; without, an
     album's numbered list, with a label row ("Disc 2") where one starts, and
     each song's length or where it starts in its file. Both have column heads,
     and leave out the Artist column when every song has the page's artist. -->
<script lang="ts">
  import type { PluginId } from '../../../shared/plugins'
  import { splitKey, type ItemKey } from '../../../shared/plugins/items'
  import SongTable from '../library/SongTable.svelte'
  import { openSongMenu } from '../library/song-menu'
  import { fmtClock, fmtTime } from '../format'
  import Eq from '../ui/Eq.svelte'
  import { roving } from '../ui/roving'
  import { actOnPage, itemInfo } from '../plugins'
  import type { SongsBlock } from '../plugins/types'
  import { queues } from '../stores/queues.svelte'
  import { queue } from '../stores/queue.svelte'
  import { rowSelection } from '../stores/selection.svelte'
  import { listRows } from '../ui/selection'
  import { dragSongs } from '../library/drag-songs'
  import { songDrag, type DragSongs } from '../stores/song-drag.svelte'

  let {
    block: b,
    plugin,
    scrollEl
  }: { block: SongsBlock; plugin: PluginId; scrollEl: HTMLElement | undefined } = $props()

  type Line = { label: string } | { key: ItemKey; at: number; no: number }

  const lines = $derived.by(() => {
    if (b.sort !== undefined) return []
    const out: Line[] = []
    const groups = b.groups ?? []
    let g = 0
    b.items.forEach((key, at) => {
      for (; g < groups.length && groups[g].at === at; g++) out.push({ label: groups[g].label })
      out.push({ key, at, no: b.numbers ? b.numbers[at] : at + 1 })
    })
    return out
  })

  const artist = $derived(b.artist ?? true)
  // the second column: the Artist, or on an artist's top songs the Album
  const second = $derived(b.album ? 'Album' : artist ? 'Artist' : undefined)
  const marked = $derived(b.marked && new Set(b.marked))
  // in the markup this would lose its spaces next to a block
  const dot = ' · '

  // Ctrl and Shift select rows (ticket 086); the table has its own
  const shown = $derived(listRows(b.items))
  const sel = rowSelection(
    () => shown,
    (keys) => keys
  )

  // the queue a click starts: the block's songs, or all of them while a few show
  function play(key: ItemKey, at: number): void {
    const list = b.queue ?? b.items
    queue.playList(list, b.queue ? Math.max(0, list.indexOf(key)) : at, b.from, b.link)
  }

  function onrowclick(e: MouseEvent, key: ItemKey, at: number): void {
    if (songDrag.tookClick()) return
    if (!sel.click(at, e)) play(key, at)
  }

  // a drag takes the selected songs when the row is one of them (ticket 089)
  function dragOf(key: ItemKey): DragSongs {
    const keys = sel.has(key) ? sel.ids() : [key]
    return dragSongs(keys, { from: b.from, link: b.link })
  }
</script>

{#snippet label()}
  {#if b.label}<h3 class="label section-label">{b.label}</h3>{/if}
{/snippet}

{#if b.sort !== undefined}
  <SongTable
    title={b.from}
    meta={b.meta ?? ''}
    items={b.items}
    {scrollEl}
    sort={b.sort}
    onsort={(k) => actOnPage(plugin, b.id, 'sort', k)}
    link={b.link}
    count={b.count ?? true}
    {artist}
    plays={b.plays ?? false}
    head={b.meta === undefined ? label : undefined}
  />
{:else}
  <!-- the rows say it all to a screen reader; the heads are for the eye -->
  <div class="list" class:noartist={!second} class:starts={!!b.starts}>
    <div class="shead song-head" aria-hidden="true">
      <span></span>
      <span>Title</span>
      {#if second}<span>{second}</span>{/if}
      {#if b.starts}
        <span class="end" title={b.starts.hint}>Starts</span>
      {:else}
        <span class="end">Time</span>
      {/if}
    </div>
    <!-- a label row is not a [data-row], so Tab and the arrows skip it -->
    <div class="lines song-rows" use:roving={{ rows: b.items, select: sel }}>
      {#each lines as line ('label' in line ? `label ${line.label}` : line.key)}
        {#if 'label' in line}
          <div class="disc section-label">{line.label}</div>
        {:else}
          {@const s = itemInfo(line.key)}
          {@const t = s.state === 'ok' ? s.info : undefined}
          {@const cur = queues.isItem(line.key)}
          {@const away = t?.unavailable}
          <button
            class="srow row"
            data-song={splitKey(line.key)?.id}
            class:cur-row={cur}
            class:selected={sel.has(line.key)}
            class:other={marked && !marked.has(line.key)}
            data-row
            aria-current={cur ? 'true' : undefined}
            onpointerdown={(e) => songDrag.press(e, () => dragOf(line.key))}
            onclick={(e) => onrowclick(e, line.key, line.at)}
            oncontextmenu={(e) =>
              openSongMenu(e, sel.menu(line.at), { from: b.from, link: b.link })}
          >
            <span class="n"
              >{#if cur && queues.songPlaying}<Eq />{:else if away}<span class="away mark">!</span
                >{:else if line.no}{line.no}{/if}</span
            >
            <span class="nm" title={t?.title}
              >{t?.title ?? ''}{#if away && !second}<span class="away">{dot}{away}</span>{/if}</span
            >
            {#if b.album}<span class="ar" class:away title={away ?? t?.group}
                >{away ?? t?.group ?? ''}</span
              >{:else if artist}<span class="ar" class:away title={away ?? t?.subtitle}
                >{away ?? t?.subtitle ?? ''}</span
              >{/if}
            {#if b.starts}
              <span class="d" title={b.starts.hint}>{fmtClock(b.starts.at[line.at] ?? 0)}</span>
            {:else}
              <span class="d">{t?.length === undefined ? '' : fmtTime(t.length)}</span>
            {/if}
          </button>
        {/if}
      {/each}
    </div>
  </div>
{/if}

<style>
  /* the table's own head sits on the same line as the song count */
  .label {
    margin: 0;
  }
  .list {
    --cols: 32px minmax(0, 2fr) minmax(0, 1.3fr) 56px;
  }
  .list.noartist {
    --cols: 32px minmax(0, 1fr) 56px;
  }
  /* a guessed start can pass an hour: "1:02:40" */
  .list.starts {
    --cols: 32px minmax(0, 2fr) minmax(0, 1.3fr) 64px;
  }
  .list.starts.noartist {
    --cols: 32px minmax(0, 1fr) 64px;
  }
  .shead,
  .srow {
    display: grid;
    grid-template-columns: var(--cols);
    gap: 16px;
    align-items: center;
  }
  .shead {
    padding: 0 14px;
    margin-bottom: 4px;
  }
  .end {
    text-align: right;
  }
  .disc {
    padding: 18px 14px 8px;
  }
  .disc:first-child {
    padding-top: 6px;
  }
  .srow {
    width: 100%;
    padding: 14px;
    font-size: var(--text-l);
    min-height: 54px;
  }
  .n,
  .d {
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
    font-size: var(--text-m);
    text-align: right;
  }
  .n {
    display: flex;
    justify-content: flex-end;
  }
  .ar {
    color: var(--ink-2);
  }
  /* its music folder was not found: why it can't play */
  .away,
  .ar.away {
    color: var(--warn);
  }
  .mark {
    font-weight: 800;
  }
  .cur-row .nm {
    font-weight: 600;
  }
  /* another artist's song on an album opened under one (ticket 099): the
     row's fill stays, its words go as dim as a played queue row */
  .other > span {
    opacity: var(--past);
  }
  .nm,
  .ar {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
