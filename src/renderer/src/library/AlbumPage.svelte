<script lang="ts">
  import { queueLink, type QueueLink } from '../../../shared/saved-queue'
  import Cover from '../ui/Cover.svelte'
  import Eq from '../ui/Eq.svelte'
  import GoLink from '../ui/GoLink.svelte'
  import Icon from '../ui/Icon.svelte'
  import { fmtTime } from '../format'
  import { roving } from '../ui/roving'
  import { library } from '../stores/library.svelte'
  import { player } from '../stores/player.svelte'
  import { playing } from '../stores/playing.svelte'
  import { queue } from '../stores/queue.svelte'
  import { albumButton, albumLabel, albumLines } from './album'
  import { artistLinks } from './artists'
  import { commonFolder, folderParts, folderPath } from './folders'
  import { openPlaylistMenu, openSongMenu } from './song-menu'

  // back: the label of the link back (an artist's name when opened from them)
  let {
    albumId,
    back = 'All albums',
    onback = () => library.openAlbum(null)
  }: { albumId: string; back?: string; onback?: () => void } = $props()

  const al = $derived(library.album(albumId))
  const tracks = $derived(al.trackIds.map((id) => library.track(id)))
  // one link per artist of a split credit
  const artists = $derived(artistLinks(al, (key) => !!library.getArtist(key)))
  const link = $derived<QueueLink>(queueLink('album', albumId))
  const minutes = $derived(Math.round(tracks.reduce((s, t) => s + t.duration, 0) / 60))
  const lines = $derived(albumLines(tracks))
  // where the album is on disk; null while the folder table is not in yet
  const folder = $derived(
    commonFolder(
      library.folders,
      tracks.map((t) => t.folder)
    )
  )
  const parts = $derived(folder === null ? undefined : folderParts(library.folders, folder))
  const btn = $derived(
    albumButton(albumId, {
      link: queue.link,
      currentAlbum: queue.current?.albumId,
      ended: queue.ended,
      queuePlays: playing.kind === 'queue',
      sounding: player.playing
    })
  )

  function playOrPause(): void {
    if (btn === 'play') queue.playAlbum(al.id, 0)
    else playing.togglePlay()
  }

  function shufflePlay(): void {
    player.shuffle = true
    queue.playAlbum(al.id, Math.floor(Math.random() * tracks.length))
  }

  // in the markup these would lose their spaces next to a block
  const comma = ', '
</script>

<button class="back" onclick={onback}><Icon name="back" size={16} />{back}</button>
<div class="albhead">
  <div class="cv"><Cover src={al.coverLarge} /></div>
  <div class="words">
    <div class="page-meta">{albumLabel(al)}</div>
    <h2 class="page-title clamp" title={al.title}>{al.title}</h2>
    <div class="page-meta">
      {#each artists as a, i (i)}{#if i}{comma}{/if}<GoLink
          go={a.key ? () => library.showArtist(a.key!) : undefined}>{a.name}</GoLink
        >{/each} · {tracks.length} songs · {minutes} min
    </div>
    {#if parts}
      {@const path = folderPath(parts)}
      <div class="page-meta path" title={path}>
        <GoLink go={() => library.showFolder(library.folders.nodes[folder!].key)}
          ><bdi dir="ltr">{path}</bdi></GoLink
        >
      </div>
    {/if}
    <div class="acts">
      <button class="pill play" onclick={playOrPause}>{btn === 'pause' ? 'Pause' : 'Play'}</button>
      <button class="pill ghost" onclick={shufflePlay}>Shuffle</button>
      <button
        class="pill ghost"
        aria-haspopup="menu"
        onclick={(e) => openPlaylistMenu(e, al.trackIds)}>Add to playlist</button
      >
      <button
        class="pill ghost more"
        aria-haspopup="menu"
        aria-label="More"
        title="Play next, add to the queue or a playlist, show in file manager"
        onclick={(e) => openSongMenu(e, al.trackIds, { from: al.title, link, folder: parts })}
        ><Icon name="more" size={18} /></button
      >
    </div>
  </div>
</div>
<!-- a "Disc 2" row is a label: not a [data-row], so Tab and the arrows skip it -->
<div class="lines" use:roving={{ rows: tracks }}>
  {#each lines as line ('disc' in line ? `disc ${line.disc}` : line.track.id)}
    {#if 'disc' in line}
      <div class="disc section-label">Disc {line.disc}</div>
    {:else}
      {@const t = line.track}
      {@const cur = playing.isSong(t.id)}
      <button
        class="srow row"
        data-song={t.id}
        class:cur-row={cur}
        data-row
        aria-current={cur ? 'true' : undefined}
        onclick={() => queue.playAlbum(al.id, line.at)}
        oncontextmenu={(e) => openSongMenu(e, [t.id], { from: al.title, link })}
      >
        <span class="n"
          >{#if cur && playing.songPlaying}<Eq />{:else if line.no}{line.no}{/if}</span
        >
        <span class="nm" title={t.title}>{t.title}</span>
        <span class="ar" title={t.artist}>{t.artist}</span>
        <span class="d">{fmtTime(t.duration)}</span>
      </button>
    {/if}
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
  /* The cover stays beside the title at any width, so the songs stay in view;
     it and the title get smaller in a narrow library. */
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
  /* the end of a long path is the part that tells albums apart; bdi keeps
     the path itself left to right */
  .path {
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    direction: rtl;
    text-align: left;
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
  /* smaller pills, so they stay on one line beside the cover in Studio's
     narrowest library */
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
  /* as wide for Pause as for Play, so the pills beside it stay put */
  .play {
    min-width: 5.6em;
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
