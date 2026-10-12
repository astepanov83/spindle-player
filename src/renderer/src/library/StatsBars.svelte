<!-- A column chart of plays (ticket 116): plays per month, per day of the
     week. One series in the album accent, clean steps on a hairline grid,
     the biggest column's number on its cap, the rest on hover or with the
     arrow keys, and a table for screen readers. -->
<script lang="ts">
  import { chartScale } from './stats'

  interface Bar {
    // under the column; '' for none
    label: string
    // in the tooltip and the table: "October 2026"
    full: string
    value: number
  }

  let {
    title,
    bars,
    unit = ['play', 'plays']
  }: {
    title: string
    bars: Bar[]
    unit?: [string, string]
  } = $props()

  const max = $derived(Math.max(0, ...bars.map((b) => b.value)))
  const scale = $derived(chartScale(max))
  // the biggest column, named on its cap; the first one of a tie
  const peak = $derived(max > 0 ? bars.findIndex((b) => b.value === max) : -1)
  const pct = (v: number): string => `${(v / scale.top) * 100}%`
  const count = (n: number): string => `${n.toLocaleString()} ${n === 1 ? unit[0] : unit[1]}`

  // the column under the pointer, or picked with the arrow keys
  let active = $state(-1)
  let plotW = $state(0)
  // a band narrower than a short name shows each one's first letter
  const narrow = $derived(bars.length > 0 && plotW / bars.length < 30)

  function key(e: KeyboardEvent): void {
    const step = { ArrowLeft: -1, ArrowRight: 1, Home: -bars.length, End: bars.length }[e.key]
    if (step === undefined || !bars.length) return
    e.preventDefault()
    const from = active < 0 ? (step > 0 ? -1 : bars.length) : active
    active = Math.min(bars.length - 1, Math.max(0, from + step))
  }

  // where the tooltip sits along the plot, kept inside it at both ends
  const tipAt = $derived(active < 0 ? 0 : (active + 0.5) / bars.length)
  const tipAlign = $derived(tipAt < 0.15 ? 'start' : tipAt > 0.85 ? 'end' : 'mid')
</script>

<figure class="chart">
  <figcaption class="section-label">{title}</figcaption>
  <div class="body">
    <div class="axis" aria-hidden="true">
      {#each scale.ticks as t (t)}<span style:bottom={pct(t)}>{t.toLocaleString()}</span>{/each}
    </div>
    <!-- One Tab stop: the arrow keys go from column to column, as along a
         slider, and the tooltip follows. Focus starts at the last one. -->
    <div
      class="plot"
      role="slider"
      tabindex="0"
      aria-label={title}
      aria-valuemin={1}
      aria-valuemax={bars.length}
      aria-valuenow={Math.max(active, 0) + 1}
      aria-valuetext={bars[active]
        ? `${bars[active].full}: ${count(bars[active].value)}`
        : undefined}
      bind:clientWidth={plotW}
      onpointerleave={() => (active = -1)}
      onfocus={(e) => {
        if (e.currentTarget.matches(':focus-visible') && active < 0) active = bars.length - 1
      }}
      onblur={() => (active = -1)}
      onkeydown={key}
    >
      <div class="grid" aria-hidden="true">
        {#each scale.ticks as t (t)}<span class:base={t === 0} style:bottom={pct(t)}></span>{/each}
      </div>
      <div class="cols">
        {#each bars as b, i (i)}
          <div
            class="band"
            class:on={active === i}
            onpointerenter={() => (active = i)}
            aria-hidden="true"
          >
            {#if b.value > 0}
              <span class="bar" style:height={pct(b.value)}>
                {#if i === peak && active < 0}<span class="cap">{b.value.toLocaleString()}</span
                  >{/if}
              </span>
            {/if}
          </div>
        {/each}
      </div>
      {#if active >= 0 && bars[active]}
        <div
          class="tip {tipAlign}"
          style:left="{tipAt * 100}%"
          style:bottom="calc({pct(bars[active].value)} + 8px)"
        >
          <b>{count(bars[active].value)}</b>
          <span>{bars[active].full}</span>
        </div>
      {/if}
    </div>
    <div class="labels" aria-hidden="true">
      {#each bars as b, i (i)}<span class:many={bars.length > 12}
          >{narrow && bars.length <= 12 ? b.label.slice(0, 1) : b.label}</span
        >{/each}
    </div>
  </div>
  <table class="sr">
    <caption>{title}</caption>
    <tbody>
      {#each bars as b, i (i)}<tr><th scope="row">{b.full}</th><td>{count(b.value)}</td></tr>{/each}
    </tbody>
  </table>
</figure>

<style>
  .chart {
    margin: 0;
    min-width: 0;
  }
  figcaption {
    margin-bottom: 12px;
  }
  /* the axis's numbers on the left, the plot, the names under it */
  .body {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: 150px auto;
    column-gap: 8px;
  }
  .axis {
    position: relative;
    min-width: 2ch;
    font-size: var(--text-xs);
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .axis span {
    position: absolute;
    right: 0;
    transform: translateY(50%);
    line-height: 1;
  }
  .plot {
    position: relative;
    border-radius: 4px;
  }
  .grid span {
    position: absolute;
    left: 0;
    right: 0;
    height: 1px;
    background: var(--edge);
  }
  .grid .base {
    background: var(--ring);
  }
  .cols {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: flex-end;
  }
  /* the whole band is the hover target, not only the column */
  .band {
    flex: 1 1 0;
    min-width: 0;
    height: 100%;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    /* at least 2px of the page between two columns */
    padding: 0 1px;
  }
  .bar {
    position: relative;
    width: min(24px, 100%);
    min-height: 2px;
    border-radius: 4px 4px 0 0;
    background: var(--c2);
    transition: background 0.1s;
  }
  .band.on .bar {
    background: color-mix(in srgb, var(--c2) 70%, var(--ink));
  }
  .cap {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    padding-bottom: 4px;
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--ink-2);
    white-space: nowrap;
  }
  .tip {
    position: absolute;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 10px;
    border-radius: 8px;
    background: var(--panel);
    box-shadow: 0 4px 16px var(--shadow);
    border: 1px solid var(--edge);
    font-size: var(--text-xs);
    color: var(--ink-2);
    white-space: nowrap;
    pointer-events: none;
  }
  .tip.mid {
    transform: translateX(-50%);
  }
  .tip.end {
    transform: translateX(-100%);
  }
  .tip b {
    font-size: var(--text-s);
    color: var(--ink);
  }
  .labels {
    grid-column: 2;
    display: flex;
    padding-top: 6px;
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .labels span {
    flex: 1 1 0;
    min-width: 0;
    text-align: center;
    white-space: nowrap;
  }
  /* many months: a year under each January, from its column on */
  .labels span.many {
    text-align: left;
    overflow: visible;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
