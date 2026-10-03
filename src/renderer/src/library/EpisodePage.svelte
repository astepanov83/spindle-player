<!-- One Music For Programming episode (ticket 052): its songs, each a stretch
     of the episode's mp3 at a guessed time. Like the album page, without the
     folder and the artist links. -->
<script lang="ts">
  import { queueLink, type QueueLink } from '../../../shared/saved-queue'
  import Cover from '../ui/Cover.svelte'
  import Eq from '../ui/Eq.svelte'
  import Icon from '../ui/Icon.svelte'
  import { fmtClock, fmtCount, fmtLength } from '../format'
  import { roving } from '../ui/roving'
  import { library } from '../stores/library.svelte'
  import { player } from '../stores/player.svelte'
  import { queues } from '../stores/queues.svelte'
  import { queue } from '../stores/queue.svelte'
  import { albumButton } from './album'
  import { songMatches } from './views'
  import { openPlaylistMenu, openSongMenu } from './song-menu'
  import { isPlaying, playAlbum, trackKey, trackKeys, trackOf } from '../plugins/files/views'
  import { openEpisode } from '../plugins/mfp/nav'

  let { albumId }: { albumId: string } = $props()

  const al = $derived(library.album(albumId))
  const tracks = $derived(al.trackIds.map((id) => library.track(id)))
  // the search box filters the songs in place
  const shown = $derived(tracks.filter((t) => songMatches(t, library.query)))
  const link = $derived<QueueLink>(queueLink('episode', albumId))
  const length = $derived(tracks.reduce((s, t) => s + t.duration, 0))
  const meta = $derived(
    [al.artist, al.year || '', fmtCount(tracks.length, 'song', 'songs'), fmtLength(length)]
      .filter(Boolean)
      .join(' · ')
  )
  // in the markup it would lose its spaces next to a block
  const dot = ' · '
  const btn = $derived(
    albumButton(albumId, {
      link: queue.link,
      currentAlbum: trackOf(queue.current)?.albumId,
      ended: queue.ended,
      queuePlays: queues.active === 'track',
      sounding: queues.wantsSound
    })
  )

  function playOrPause(): void {
    if (btn === 'play') playAlbum(al.id, 0)
    else queues.togglePlay()
  }

  function shufflePlay(): void {
    player.shuffle = true
    playAlbum(al.id, Math.floor(Math.random() * tracks.length))
  }

  // the whole episode is the queue, from this song on
  function play(id: string): void {
    playAlbum(al.id, al.trackIds.indexOf(id))
  }
</script>

<button class="back" onclick={() => openEpisode(null)}
  ><Icon name="back" size={16} />All episodes</button
>
<div class="albhead">
  <div class="cv"><Cover src={al.coverLarge} /></div>
  <div class="words">
    <div class="page-meta">Music For Programming</div>
    <h2 class="page-title clamp" title={al.title}>{al.title}</h2>
    <div class="page-meta">
      {meta}{#if al.link}{dot}<a href={al.link} target="_blank" rel="noreferrer"
          >{al.link.replace(/^https:\/\//, '')}</a
        >{/if}
    </div>
    <div class="page-meta">Song times are guessed: the site gives none.</div>
    <div class="acts">
      <button class="pill play" onclick={playOrPause}>{btn === 'pause' ? 'Pause' : 'Play'}</button>
      <button class="pill ghost" onclick={shufflePlay}>Shuffle</button>
      <button
        class="pill ghost"
        aria-haspopup="menu"
        onclick={(e) => openPlaylistMenu(e, trackKeys(al.trackIds))}>Add to playlist</button
      >
      <button
        class="pill ghost more"
        aria-haspopup="menu"
        aria-label="More"
        title="Play next, add to the queue or a playlist"
        onclick={(e) => openSongMenu(e, trackKeys(al.trackIds), { from: al.title, link })}
        ><Icon name="more" size={18} /></button
      >
    </div>
  </div>
</div>
<div class="lines" use:roving={{ rows: shown }}>
  {#each shown as t (t.id)}
    {@const cur = isPlaying(t)}
    <button
      class="srow row"
      data-song={t.id}
      class:cur-row={cur}
      data-row
      aria-current={cur ? 'true' : undefined}
      onclick={() => play(t.id)}
      oncontextmenu={(e) => openSongMenu(e, [trackKey(t)], { from: al.title, link })}
    >
      <span class="n"
        >{#if cur && queues.songPlaying}<Eq />{:else}{t.no}{/if}</span
      >
      <span class="nm" title={t.title}>{t.title}</span>
      <span class="ar" title={t.artist}>{t.artist}</span>
      <span class="d" title="Guessed start">{fmtClock(t.part?.start ?? 0)}</span>
    </button>
  {/each}
</div>

<style>
  .back {
    font-size: var(--text-s);
    color: var(--ink-3);
    display: inline-flex;
    gap: 4px;
    align-items: center;
    margin-top: 4px;
  }
  .back:hover {
    color: var(--ink);
  }
  .albhead {
    container-type: inline-size;
    display: flex;
    gap: 22px;
    align-items: flex-end;
    padding: 8px 0 22px;
  }
  .cv {
    width: 160px;
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 14px 30px -12px var(--shadow);
    flex: none;
  }
  .words {
    flex: 1;
    min-width: 0;
  }
  .page-meta a {
    color: inherit;
  }
  .page-meta a:hover {
    color: var(--ink);
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 16px;
  }
  @container (max-width: 560px) {
    .cv {
      width: 112px;
    }
    .page-title {
      font-size: var(--title-l);
    }
    .acts {
      margin-top: 12px;
    }
  }
  @container (max-width: 480px) {
    .acts {
      gap: 6px;
    }
    .acts .pill {
      padding: 7px 12px;
      font-size: var(--text-s);
    }
    .acts .pill.more {
      padding: 7px 8px;
    }
  }
  @container (max-width: 400px) {
    .cv {
      width: 88px;
    }
  }
  .play {
    min-width: 5.6em;
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
