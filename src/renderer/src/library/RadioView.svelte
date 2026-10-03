<!-- Radio in Studio's chips and Classic's sidebar (ticket 029): My stations,
     filtered at once by the search box, then Radio Browser's stations for it.
     Reads radio's page half until blocks draw it (ticket 062). -->
<script lang="ts">
  import ViewHead from './ViewHead.svelte'
  import Icon from '../ui/Icon.svelte'
  import { fmtCount } from '../format'
  import Thumb from '../ui/Thumb.svelte'
  import { roving } from '../ui/roving'
  import { stationArt, type Station } from '../../../shared/stations'
  import { itemKey } from '../../../shared/plugins/items'
  import { bitrateLine, searchRows, stationLine, stationMatches } from '../plugins/radio/logic'
  import { radioSearch } from '../plugins/radio/search.svelte'
  import { radio } from '../plugins/radio/store.svelte'
  import { library } from '../stores/library.svelte'
  import { menu, type MenuEntry } from '../stores/menu.svelte'
  import { queues } from '../stores/queues.svelte'

  // where the search box is, for the hint under the title
  let { searchAt }: { searchAt: 'above' | 'left' } = $props()

  const q = $derived(library.query.trim())
  const mine = $derived(radio.stations.filter((s) => stationMatches(s, q)))
  const saved = $derived(new Map(radio.stations.map((s) => [s.id, s])))
  // a saved station shows only under My stations
  const found = $derived(searchRows(radioSearch.results, radio.stations))

  // Radio Browser is asked 400ms after typing stops (the store waits)
  $effect(() => {
    radioSearch.want(library.query)
  })

  // A saved station's logo is a cover (030). A result's comes through main,
  // which fetches it when the row shows: the page can't load from the web.
  function logo(s: Station, result: boolean): string | undefined {
    const own = saved.get(s.id) ?? s
    if (own.logo) return stationArt(own).cover
    return result && s.logoUrl ? `spindle://radio-logo/${s.id}` : undefined
  }

  const isOn = (s: Station): boolean =>
    queues.active === 'live' && queues.live.current === itemKey('radio', s.id)

  // A result that is in My stations plays as saved: its chosen stream and logo.
  function play(s: Station): void {
    radio.playOffered(saved.get(s.id) ?? s, () => void queues.playItem(itemKey('radio', s.id)))
  }

  function star(s: Station): void {
    if (saved.has(s.id)) void radio.remove(s.id)
    // the playing copy has the streams main found and the stream picked
    else void radio.save(radio.station?.id === s.id ? radio.station : s)
  }

  function openMenu(e: MouseEvent, s: Station): void {
    const at = radio.stations.findIndex((x) => x.id === s.id)
    const entries: MenuEntry[] = []
    if (at > 0) entries.push({ label: 'Move up', run: () => void radio.move(s.id, -1) })
    if (at >= 0 && at < radio.stations.length - 1)
      entries.push({ label: 'Move down', run: () => void radio.move(s.id, 1) })
    entries.push({ label: 'Remove', run: () => void radio.remove(s.id) })
    menu.showFor(e, entries)
  }

  // A list is one Tab stop (ui/roving.ts); Right reaches a row's star, Left goes back.
  function onrowkey(e: KeyboardEvent & { currentTarget: HTMLElement }, to: 'star' | 'main'): void {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (e.key !== (to === 'star' ? 'ArrowRight' : 'ArrowLeft')) return
    e.preventDefault()
    e.currentTarget.closest('[data-line]')?.querySelector<HTMLElement>(`.${to}`)?.focus()
  }
</script>

{#snippet row(s: Station, result: boolean)}
  {@const on = isOn(s)}
  {@const isSaved = saved.has(s.id)}
  {@const line = stationLine(s)}
  <div
    class="row"
    class:cur-row={on}
    role="listitem"
    data-line
    oncontextmenu={isSaved && !result ? (e) => openMenu(e, s) : undefined}
  >
    <button
      class="main"
      class:cur={on}
      title={s.name}
      data-row
      aria-current={on ? 'true' : undefined}
      onkeydown={(e) => onrowkey(e, 'star')}
      onclick={() => play(s)}
    >
      <!-- bars only while sound comes out; a dot while it connects or recovers -->
      <Thumb
        src={logo(s, result)}
        size={44}
        radius={6}
        eq={on && radio.status === 'live'}
        busy={on && radio.status !== 'live' && radio.status !== 'off'}
      />
      <span class="txt">
        <span class="nm">{s.name}</span>
        {#if line}<span class="sub" title={line}>{line}</span>{/if}
      </span>
      <span class="br">{bitrateLine(s)}</span>
    </button>
    <button
      class="star"
      class:on={isSaved}
      tabindex="-1"
      onkeydown={(e) => onrowkey(e, 'main')}
      aria-pressed={isSaved}
      title={isSaved ? 'Remove from My stations' : 'Add to My stations'}
      onclick={() => star(s)}><Icon name={isSaved ? 'starOn' : 'star'} size={20} /></button
    >
  </div>
{/snippet}

<ViewHead
  title="Radio"
  meta="Internet radio"
  count={fmtCount(radio.stations.length, 'station', 'stations')}
  hint="Find stations with the search box {searchAt === 'above' ? 'above' : 'on the left'}."
/>
<div class="radio">
  <h3 class="section-label">My stations</h3>
  <div class="list lines" role="list" use:roving={{ rows: mine }}>
    {#each mine as s (s.id)}
      {@render row(s, false)}
    {/each}
  </div>
  {#if !radio.stations.length}
    <p class="hint">No stations yet. Search for one, then press its star to keep it here.</p>
  {:else if !mine.length}
    <p class="hint">None of My stations match.</p>
  {/if}

  {#if radioSearch.status !== 'idle'}
    <h3 class="section-label">From Radio Browser</h3>
    {#if radioSearch.status === 'unreachable'}
      <p class="hint">Radio Browser can't be reached. My stations still play.</p>
    {:else if radioSearch.status === 'searching' && !found.length}
      <p class="hint">Searching…</p>
    {:else if radioSearch.status === 'done' && !found.length}
      <p class="hint">
        {radioSearch.results.length
          ? 'Every station found is in My stations.'
          : 'No stations found.'}
      </p>
    {:else}
      <div
        class="list lines"
        role="list"
        class:stale={radioSearch.status === 'searching'}
        use:roving={{ rows: found }}
      >
        {#each found as s (s.id)}
          {@render row(s, true)}
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .radio {
    display: flex;
    flex-direction: column;
    padding-bottom: 12px;
  }
  h3 {
    margin: 14px 12px 6px;
  }
  h3:first-child {
    margin-top: 4px;
  }
  .list {
    display: flex;
    flex-direction: column;
  }
  .stale {
    opacity: 0.6;
  }
  .row {
    display: flex;
    align-items: center;
  }
  .main {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: 44px 1fr auto;
    gap: 14px;
    align-items: center;
    text-align: left;
    padding: 8px 4px 8px 12px;
    min-height: 60px;
  }
  .txt {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .nm,
  .sub {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .nm {
    font-size: var(--text-l);
  }
  .cur .nm {
    font-weight: 600;
  }
  .sub {
    font-size: var(--text-s);
    color: var(--ink-3);
  }
  .br {
    font-size: var(--text-s);
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .star {
    width: 40px;
    height: 40px;
    margin-right: 6px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    color: var(--ink-3);
    flex: none;
  }
  .star:hover {
    background: var(--hover);
    color: var(--ink);
  }
  .star.on {
    color: var(--c2);
  }
  .hint {
    color: var(--ink-3);
    font-size: var(--text-m);
    line-height: 1.6;
    padding: 6px 12px;
    margin: 0;
    max-width: 52ch;
  }
</style>
