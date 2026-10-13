<!-- The core's Stats page (ticket 116): what was played in a year or all
     time. Main counts the play log and sends only the totals; this draws
     them, and before the log began fills all time's top lists from
     plays.json. -->
<script lang="ts">
  import { untrack } from 'svelte'
  import Empty from './Empty.svelte'
  import StatsBars from './StatsBars.svelte'
  import StatsTop from './StatsTop.svelte'
  import ViewHead from './ViewHead.svelte'
  import SearchButtons from '../blocks/SearchButtons.svelte'
  import type { StatsPeriod, TopGroup } from '../../../shared/plays'
  import type { ItemKey } from '../../../shared/plugins/items'
  import { infoOf, itemsVersion, tileAt, widerTabs } from '../plugins'
  import type { NavKind } from '../plugins/types'
  import { library, statsTab } from '../stores/library.svelte'
  import { plays } from '../stores/plays.svelte'
  import { queue } from '../stores/queue.svelte'
  import { stats } from '../stores/stats.svelte'
  import { playedSong } from './plays'
  import {
    albumTo,
    artistTo,
    dayNames,
    dayText,
    hoursText,
    monthLabels,
    monthText,
    periodOptions,
    withOlderPlays,
    type TopRow
  } from './stats'

  let { nav }: { nav: NavKind } = $props()

  const thisYear = new Date().getFullYear()

  // asked again on each new play while the page shows
  $effect(() => {
    void plays.all
    untrack(() => void stats.load(thisYear))
  })

  // the songs in the library now, for all time's top lists from plays.json
  const view = $derived.by(() => {
    const s = stats.shown
    if (!s) return undefined
    void itemsVersion()
    return withOlderPlays(
      s,
      plays.all,
      (key) => {
        const info = infoOf(key)
        return info && playedSong(info, 0)
      },
      Date.now()
    )
  })
  const s = $derived(view?.stats)
  const options = $derived(s ? periodOptions(s.years, thisYear) : [])
  const periodName = $derived(
    s?.period === 'all'
      ? 'all time'
      : s?.period === thisYear
        ? 'this year'
        : s?.period === thisYear - 1
          ? 'last year'
          : String(s?.period ?? '')
  )
  // no play at all, in the log or plays.json
  const nothing = $derived(!!s && !s.years.length && !view?.older)
  const hasTops = $derived(!!s && (s.topSongs.length > 0 || s.topArtists.length > 0))

  const wider = $derived(widerTabs(statsTab, nav))

  // when the log began, on the pages it matters to: all time, and its first year
  const startNote = $derived.by(() => {
    if (!s) return ''
    const older = view?.older ? ' The top lists also count earlier plays.' : ''
    if (s.since === undefined) return older && `Stats start with the next song you play.${older}`
    const first = new Date(s.since).getFullYear()
    if (s.period !== 'all' && s.period !== first) return ''
    return `Stats start on ${dayText(s.since)}.${s.period === 'all' ? older : ''}`
  })

  const tiles = $derived(
    s
      ? [
          {
            label: 'Hours listened',
            value: hoursText(s.seconds),
            hint: 'The lengths of the songs played, added up'
          },
          { label: 'Plays', value: s.plays.toLocaleString() },
          { label: 'Songs', value: s.songs.toLocaleString() },
          { label: 'Artists', value: s.artists.toLocaleString() }
        ]
      : []
  )

  const monthBars = $derived.by(() => {
    if (!s) return []
    const labels = monthLabels(s.months.map((m) => m.month))
    return s.months.map((m, i) => ({
      label: labels[i],
      full: monthText(m.month).full,
      value: m.plays
    }))
  })
  const dayBars = $derived(
    s ? s.days.map((n, i) => ({ label: dayNames[i].slice(0, 3), full: dayNames[i], value: n })) : []
  )

  // Play on a top song plays the list from it, so the next ones follow
  function playSongs(from: ItemKey): void {
    const keys = (s?.topSongs ?? []).map((t) => t.key).filter((k) => infoOf(k))
    const at = keys.indexOf(from)
    if (at >= 0) queue.playList(keys, at)
  }

  const songRows = $derived.by((): TopRow[] => {
    void itemsVersion()
    return (s?.topSongs ?? []).map((t) => {
      const info = infoOf(t.key)
      return {
        id: t.key,
        name: t.title,
        sub: t.artist,
        plays: t.plays,
        pic: { art: info?.art },
        ...(info
          ? {
              to: info.titleTo,
              songs: () => [t.key],
              play: () => playSongs(t.key)
            }
          : {})
      }
    })
  })

  // An artist or album with its tile from its plugin, while it is in the library.
  function groupRows(list: TopGroup[], round: boolean): TopRow[] {
    void itemsVersion()
    return list.map((g) => {
      const info = infoOf(g.key)
      const to = round ? artistTo(info, g.name) : albumTo(info, g.name)
      const tile = to && tileAt(to)
      return {
        id: `${g.artist}\n${g.name}`,
        name: g.name,
        ...(round ? {} : { sub: g.artist }),
        plays: g.plays,
        pic: round
          ? { round: true, photo: tile?.photo, covers: tile?.covers ?? [] }
          : { art: tile?.art },
        ...(to && tile
          ? {
              to,
              songs: tile.songs,
              play: () => queue.playList(tile.songs(), 0, tile.link)
            }
          : {})
      }
    })
  }

  const artistRows = $derived(s ? groupRows(s.topArtists, true) : [])
  const albumRows = $derived(s ? groupRows(s.topAlbums, false) : [])

  function choose(value: string): void {
    const period: StatsPeriod = value === 'all' ? 'all' : Number(value)
    stats.pick(period, thisYear)
  }
</script>

{#if s}
  <ViewHead
    title="Stats"
    hint={startNote || undefined}
    choice={nothing
      ? undefined
      : {
          label: 'Period',
          value: String(s.period),
          options: options.map((o) => ({ value: String(o.value), label: o.label })),
          ...(options.length > 4 ? { menu: { prefix: '' } } : {})
        }}
    onchoose={choose}
  />
{/if}
{#if library.query.trim()}
  <Empty
    title="Nothing to search here"
    text="The stats have no search. Search your library instead."
    >{#if wider.length}<SearchButtons tabs={wider} />{/if}</Empty
  >
{:else if s}
  <div class="stats" class:loading={stats.loading}>
    {#if nothing}
      <Empty
        title="No plays yet"
        text="Play some music. A song counts once half of it has played, or 4 minutes of it."
      />
    {:else}
      {#if s.plays > 0}
        <div class="tiles">
          {#each tiles as t (t.label)}
            <div class="tile" title={t.hint}>
              <span class="label">{t.label}</span>
              <span class="value">{t.value}</span>
            </div>
          {/each}
        </div>
        <div class="charts">
          <StatsBars title="Plays per month" bars={monthBars} />
          <StatsBars title="Plays per day of the week" bars={dayBars} />
        </div>
      {:else if !hasTops}
        <Empty
          title="Nothing played {periodName}"
          text="Songs you play show up here once they count as played."
        />
      {/if}
      {#if hasTops}
        <div class="tops">
          <StatsTop title="Top artists" rows={artistRows} />
          <StatsTop title="Top albums" rows={albumRows} />
          <StatsTop title="Top songs" rows={songRows} />
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .stats {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 32px;
    padding-bottom: 8px;
    transition: opacity 0.15s;
  }
  /* the last answer stays while the next one comes */
  .loading {
    opacity: 0.6;
  }
  /* four in a row, or two by two: never three and one */
  .tiles {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  @container (max-width: 560px) {
    .tiles {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 14px 16px;
    border-radius: 12px;
    background: var(--field);
  }
  .label {
    font-size: var(--text-s);
    color: var(--ink-2);
  }
  .value {
    font-family: var(--display);
    font-size: var(--title-m);
    font-weight: 700;
    color: var(--ink);
  }
  /* side by side where both fit, the week under the months where not */
  .charts {
    display: flex;
    flex-wrap: wrap;
    gap: 32px;
  }
  .charts > :global(:first-child) {
    flex: 2 1 360px;
  }
  .charts > :global(:last-child) {
    flex: 1 1 220px;
  }
  .tops {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
    gap: 24px 32px;
  }
</style>
