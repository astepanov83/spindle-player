<!-- One top list of the stats page (ticket 116): ten artists, albums or
     songs, most played first. A click opens its page, the play button plays
     it, right-click is the song menu. One that left the library shows its
     name from the log, and nothing to open or play. -->
<script lang="ts">
  import ArtistPic from './ArtistPic.svelte'
  import Cover from '../ui/Cover.svelte'
  import Icon from '../ui/Icon.svelte'
  import type { TopRow } from './stats'
  import { openPage } from '../plugins'
  import { openSongMenu } from './song-menu'
  import { fmtCount } from '../format'
  import { theme } from '../stores/theme.svelte'

  let { title, rows }: { title: string; rows: TopRow[] } = $props()
</script>

<section class="toplist">
  <h3 class="section-label">{title}</h3>
  <ol class="lines">
    {#each rows as r, i (r.id)}
      <li
        class="row"
        class:gone={!r.to}
        oncontextmenu={(e) => {
          if (!r.songs) return
          e.preventDefault()
          openSongMenu(e, r.songs())
        }}
      >
        <span class="n">{i + 1}</span>
        <button
          class="open"
          disabled={!r.to}
          title={r.to ? undefined : 'Not in your library now'}
          onclick={() => r.to && openPage(r.to)}
        >
          <span class="pic" class:round={r.pic.round}>
            {#if r.pic.round}
              <ArtistPic name={r.name} photo={r.pic.photo} covers={r.pic.covers} />
            {:else}
              <Cover
                src={r.pic.art?.cover}
                art={r.pic.art}
                tint={r.pic.art?.palette[theme.light ? 'light' : 'dark'][0]}
              />
            {/if}
          </span>
          <span class="text">
            <span class="name" title={r.name}>{r.name || 'Unknown'}</span>
            {#if r.sub}<span class="sub" title={r.sub}>{r.sub}</span>{/if}
          </span>
        </button>
        <!-- a narrow list keeps the number and drops the word -->
        <span class="plays" title={fmtCount(r.plays, 'play', 'plays')}
          >{r.plays.toLocaleString()}<span class="word">
            {r.plays === 1 ? 'play' : 'plays'}</span
          ></span
        >
        {#if r.play}
          <button class="qp" aria-label="Play {r.name}" title="Play" onclick={r.play}
            ><Icon name="play" size={16} /></button
          >
        {:else}
          <span class="qp-space"></span>
        {/if}
      </li>
    {/each}
  </ol>
</section>

<style>
  .toplist {
    min-width: 0;
    container-type: inline-size;
  }
  h3 {
    margin: 0 0 8px;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .row {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) auto 32px;
    align-items: center;
    gap: 8px;
    padding: 0 6px 0 4px;
    min-height: 56px;
    border-radius: 8px;
  }
  .row:hover {
    background: var(--hover);
  }
  .n {
    text-align: right;
    font-size: var(--text-s);
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }
  .open {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    text-align: left;
    padding: 6px 0;
    border-radius: 6px;
  }
  .open:disabled {
    cursor: default;
  }
  .pic {
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: 6px;
    overflow: hidden;
  }
  .pic.round {
    border-radius: 50%;
  }
  .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name,
  .sub {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .name {
    font-size: var(--text-m);
  }
  .sub {
    font-size: var(--text-s);
    color: var(--ink-3);
    margin-top: 2px;
  }
  .gone .name {
    color: var(--ink-2);
  }
  .plays {
    font-size: var(--text-s);
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .qp {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--ink-2);
    opacity: 0;
  }
  .row:hover .qp,
  .qp:focus-visible {
    opacity: 1;
  }
  .qp:hover {
    background: var(--active);
    color: var(--ink);
  }
  @container (max-width: 300px) {
    .word {
      display: none;
    }
    .open {
      gap: 8px;
    }
    .pic {
      width: 32px;
      height: 32px;
    }
    /* no column of its own: it shows over the number on hover */
    .row {
      grid-template-columns: 18px minmax(0, 1fr) auto;
    }
    .qp,
    .qp:hover {
      position: absolute;
      right: 4px;
      background: var(--field);
    }
    .qp-space {
      display: none;
    }
  }
</style>
