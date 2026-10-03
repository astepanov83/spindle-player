<!-- A songs block. With a sort it is the sortable song table; without, an
     album's numbered list, with a label row ("Disc 2") where one starts, and
     each song's length or where it starts in its file. -->
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

  // the queue a click starts: the block's songs, or all of them while a few show
  function play(key: ItemKey, at: number): void {
    const list = b.queue ?? b.items
    queue.playList(list, b.queue ? Math.max(0, list.indexOf(key)) : at, b.from, b.link)
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
    head={b.meta === undefined ? label : undefined}
  />
{:else}
  <!-- a label row is not a [data-row], so Tab and the arrows skip it -->
  <div class="lines" use:roving={{ rows: b.items }}>
    {#each lines as line ('label' in line ? `label ${line.label}` : line.key)}
      {#if 'label' in line}
        <div class="disc section-label">{line.label}</div>
      {:else}
        {@const s = itemInfo(line.key)}
        {@const t = s.state === 'ok' ? s.info : undefined}
        {@const cur = queues.isItem(line.key)}
        <button
          class="srow row"
          data-song={splitKey(line.key)?.id}
          class:cur-row={cur}
          data-row
          aria-current={cur ? 'true' : undefined}
          onclick={() => play(line.key, line.at)}
          oncontextmenu={(e) => openSongMenu(e, [line.key], { from: b.from, link: b.link })}
        >
          <span class="n"
            >{#if cur && queues.songPlaying}<Eq />{:else if line.no}{line.no}{/if}</span
          >
          <span class="nm" title={t?.title}>{t?.title ?? ''}</span>
          <span class="ar" title={t?.subtitle}>{t?.subtitle ?? ''}</span>
          {#if b.starts}
            <span class="d" title={b.starts.hint}>{fmtClock(b.starts.at[line.at] ?? 0)}</span>
          {:else}
            <span class="d">{t?.length === undefined ? '' : fmtTime(t.length)}</span>
          {/if}
        </button>
      {/if}
    {/each}
  </div>
{/if}

<style>
  /* the table's own head sits on the same line as the song count */
  .label {
    margin: 0;
  }
  .disc {
    padding: 18px 14px 8px;
  }
  .disc:first-child {
    padding-top: 0;
  }
  .srow {
    display: grid;
    grid-template-columns: 32px minmax(0, 2fr) minmax(0, 1.3fr) auto;
    gap: 16px;
    align-items: center;
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
  .cur-row .nm {
    font-weight: 600;
  }
  .nm,
  .ar {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
