<!-- Radio in Studio's chips and Classic's sidebar (ticket 029): My stations,
     filtered at once by the search box, then Radio Browser's stations for it. -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte'
  import Thumb from '../ui/Thumb.svelte'
  import { stationArt, type Station } from '../../../shared/stations'
  import { bitrateLine, stationLine, stationMatches } from '../radio/logic'
  import { library } from '../stores/library.svelte'
  import { menu, type MenuEntry } from '../stores/menu.svelte'
  import { playing } from '../stores/playing.svelte'
  import { radio } from '../stores/radio.svelte'
  import { radioSearch } from '../stores/radio-search.svelte'

  const q = $derived(library.query.trim())
  const mine = $derived(radio.stations.filter((s) => stationMatches(s, q)))
  const saved = $derived(new Map(radio.stations.map((s) => [s.id, s])))

  // Radio Browser is asked 400ms after typing stops (the store waits)
  $effect(() => radioSearch.want(library.query))

  // A saved station's logo is a cover (030). A result's comes through main,
  // which fetches it when the row shows: the page can't load from the web.
  function logo(s: Station, result: boolean): string | undefined {
    const own = saved.get(s.id) ?? s
    if (own.logo) return stationArt(own).cover
    return result && s.logoUrl ? `spindle://radio-logo/${s.id}` : undefined
  }

  const isOn = (s: Station): boolean => playing.kind === 'radio' && radio.station?.id === s.id

  // A result that is in My stations plays as saved: its chosen stream and logo.
  function play(s: Station): void {
    void playing.playStation(saved.get(s.id) ?? s)
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
</script>

{#snippet row(s: Station, result: boolean)}
  {@const on = isOn(s)}
  {@const isSaved = saved.has(s.id)}
  {@const line = stationLine(s)}
  <div
    class="row"
    class:cur-row={on}
    role="listitem"
    oncontextmenu={isSaved && !result ? (e) => openMenu(e, s) : undefined}
  >
    <button class="main" class:cur={on} title={s.name} onclick={() => play(s)}>
      <Thumb src={logo(s, result)} size={44} radius={6} eq={on} />
      <span class="txt">
        <span class="nm">{s.name}</span>
        {#if line}<span class="sub">{line}</span>{/if}
      </span>
      <span class="br">{bitrateLine(s)}</span>
    </button>
    <button
      class="star"
      class:on={isSaved}
      aria-pressed={isSaved}
      title={isSaved ? 'Remove from My stations' : 'Add to My stations'}
      onclick={() => star(s)}><Icon name={isSaved ? 'starOn' : 'star'} size={20} /></button
    >
  </div>
{/snippet}

<div class="radio">
  <h3>My stations</h3>
  <div class="list" role="list">
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
    <h3>From Radio Browser</h3>
    {#if radioSearch.status === 'unreachable'}
      <p class="hint">Radio Browser can't be reached. My stations still play.</p>
    {:else if radioSearch.status === 'searching' && !radioSearch.results.length}
      <p class="hint">Searching…</p>
    {:else if radioSearch.status === 'done' && !radioSearch.results.length}
      <p class="hint">No stations found.</p>
    {:else}
      <div class="list" role="list" class:stale={radioSearch.status === 'searching'}>
        {#each radioSearch.results as s (s.id)}
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
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-3);
    font-weight: 600;
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
    border-radius: 10px;
  }
  .row + .row {
    box-shadow: 0 -1px 0 var(--edge);
  }
  .row:hover {
    background: var(--hover);
    box-shadow: none;
  }
  .row.cur-row {
    background: color-mix(in srgb, var(--c2) 26%, var(--hover));
    box-shadow: inset 3px 0 0 var(--c2);
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
    font-size: 15px;
  }
  .cur .nm {
    font-weight: 600;
  }
  .sub {
    font-size: 13px;
    color: var(--ink-3);
  }
  .br {
    font-size: 13px;
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
    font-size: 14px;
    line-height: 1.6;
    padding: 6px 12px;
    margin: 0;
    max-width: 52ch;
  }
</style>
