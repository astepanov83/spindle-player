<script lang="ts">
  import type { QueueLink } from '../../../shared/saved-queue'
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
  import { artistLinks } from './artists'
  import { openPlaylistMenu, openSongMenu } from './song-menu'

  // back: the label of the link back (an artist's name when opened from them)
  let { albumId, back = 'All albums' }: { albumId: string; back?: string } = $props()

  const al = $derived(library.album(albumId))
  const tracks = $derived(al.trackIds.map((id) => library.track(id)))
  // one link per artist of a split credit
  const artists = $derived(artistLinks(al, (key) => !!library.getArtist(key)))
  const link = $derived<QueueLink>({ kind: 'album', id: albumId })
  const minutes = $derived(Math.round(tracks.reduce((s, t) => s + t.duration, 0) / 60))

  function shufflePlay(): void {
    player.shuffle = true
    queue.playAlbum(al.id, Math.floor(Math.random() * tracks.length))
  }

  // in the markup these would lose their spaces next to a block
  const comma = ', '
</script>

<button class="back" onclick={() => (library.open = null)}
  ><Icon name="back" size={16} />{back}</button
>
<div class="albhead">
  <div class="cv"><Cover src={al.coverLarge} /></div>
  <div class="words">
    <div class="page-meta">Album{al.year ? ` · ${al.year}` : ''}</div>
    <h2 class="page-title clamp" title={al.title}>{al.title}</h2>
    <div class="page-meta">
      {#each artists as a, i (i)}{#if i}{comma}{/if}<GoLink
          go={a.key ? () => library.showArtist(a.key!) : undefined}>{a.name}</GoLink
        >{/each} · {tracks.length} songs · {minutes} min
    </div>
    <div class="acts">
      <button class="pill" onclick={() => queue.playAlbum(al.id, 0)}>Play</button>
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
        title="Play next, add to the queue or a playlist"
        onclick={(e) => openSongMenu(e, al.trackIds, { from: al.title, link })}
        ><Icon name="more" size={18} /></button
      >
    </div>
  </div>
</div>
<div class="lines" use:roving={{ rows: tracks }}>
  {#each tracks as t, i (t.id)}
    {@const cur = playing.isSong(t.id)}
    <button
      class="srow row"
      data-song={t.id}
      class:cur-row={cur}
      data-row
      aria-current={cur ? 'true' : undefined}
      onclick={() => queue.playAlbum(al.id, i)}
      oncontextmenu={(e) => openSongMenu(e, [t.id], { from: al.title, link })}
    >
      <span class="n"
        >{#if cur && playing.songPlaying}<Eq />{:else}{i + 1}{/if}</span
      >
      <span class="nm" title={t.title}>{t.title}</span>
      <span class="ar" title={t.artist}>{t.artist}</span>
      <span class="d">{fmtTime(t.duration)}</span>
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
