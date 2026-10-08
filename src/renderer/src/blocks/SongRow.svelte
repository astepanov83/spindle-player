<!-- A song in an album's numbered list: its number (the bars while it
     plays), title, artist or album, and length. The album page and an
     artist's albums with their songs (ticket 100) draw it. -->
<script module lang="ts">
  // The columns, for the row and the heads over it. A guessed start can
  // pass an hour: "1:02:40".
  export function songCols(second: boolean, starts: boolean): string {
    const end = starts ? '64px' : '56px'
    return second ? `32px minmax(0, 2fr) minmax(0, 1.3fr) ${end}` : `32px minmax(0, 1fr) ${end}`
  }
</script>

<script lang="ts">
  import { splitKey, type ItemKey } from '../../../shared/plugins/items'
  import { fmtTime } from '../format'
  import Eq from '../ui/Eq.svelte'
  import { itemInfo } from '../plugins'
  import { queues } from '../stores/queues.svelte'

  let {
    key,
    no,
    index,
    top,
    second,
    start,
    selected,
    other = false,
    onclick,
    oncontextmenu,
    onpointerdown
  }: {
    key: ItemKey
    // 0: none
    no: number
    // its place for the keys in a list that draws only some rows
    index?: number
    // its place in such a list, in px; it then lies on the rows' left
    // edge, past a cover's column (--side)
    top?: number
    // the second column: the Artist, or on an artist's top songs the Album
    second?: 'Artist' | 'Album'
    // where it starts in its file, in place of its length (MFP)
    start?: { text: string; hint: string }
    selected: boolean
    // another artist's song on an album opened under one (ticket 099)
    other?: boolean
    onclick: (e: MouseEvent) => void
    oncontextmenu: (e: MouseEvent) => void
    onpointerdown: (e: PointerEvent) => void
  } = $props()

  const s = $derived(itemInfo(key))
  const t = $derived(s.state === 'ok' ? s.info : undefined)
  const cur = $derived(queues.isItem(key))
  const away = $derived(t?.unavailable)
  // in the markup this would lose its spaces next to a block
  const dot = ' · '
</script>

<button
  class="srow row"
  data-song={splitKey(key)?.id}
  class:cur-row={cur}
  class:selected
  class:other
  data-row
  data-index={index}
  class:placed={top !== undefined}
  style:transform={top === undefined ? undefined : `translateY(${top}px)`}
  style:grid-template-columns={songCols(!!second, !!start)}
  aria-current={cur ? 'true' : undefined}
  {onpointerdown}
  {onclick}
  {oncontextmenu}
>
  <span class="n"
    >{#if cur && queues.songPlaying}<Eq />{:else if away}<span class="away mark">!</span
      >{:else if no}{no}{/if}</span
  >
  <span class="nm" title={t?.title}
    >{t?.title ?? ''}{#if away && !second}<span class="away">{dot}{away}</span>{/if}</span
  >
  {#if second === 'Album'}<span class="ar" class:away title={away ?? t?.group}
      >{away ?? t?.group ?? ''}</span
    >{:else if second}<span class="ar" class:away title={away ?? t?.subtitle}
      >{away ?? t?.subtitle ?? ''}</span
    >{/if}
  {#if start}
    <span class="d" title={start.hint}>{start.text}</span>
  {:else}
    <span class="d">{t?.length === undefined ? '' : fmtTime(t.length)}</span>
  {/if}
</button>

<style>
  .srow {
    display: grid;
    gap: 16px;
    align-items: center;
    width: 100%;
    padding: 14px;
    font-size: var(--text-l);
    min-height: 54px;
  }
  .placed {
    position: absolute;
    top: 0;
    left: var(--side, 0);
    right: 0;
    width: auto;
    height: 54px;
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
