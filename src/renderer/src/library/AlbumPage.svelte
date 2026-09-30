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
  <div>
    <div class="page-meta">Album{al.year ? ` · ${al.year}` : ''}</div>
    <h2 class="page-title">{al.title}</h2>
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
<div use:roving={{ rows: tracks }}>
  {#each tracks as t, i (t.id)}
    {@const cur = queue.isCurrent(t.id)}
    <button
      class="srow"
      data-song={t.id}
      class:cur
      data-row
      aria-current={cur ? 'true' : undefined}
      onclick={() => queue.playAlbum(al.id, i)}
      oncontextmenu={(e) => openSongMenu(e, [t.id], { from: al.title, link })}
    >
      <span class="n"
        >{#if cur && playing.songPlaying}<Eq />{:else}{i + 1}{/if}</span
      >
      <span class="nm">{t.title}</span>
      <span class="ar">{t.artist}</span>
      <span class="d">{fmtTime(t.duration)}</span>
    </button>
  {/each}
</div>

<style>
  .back {
    font-size: 13px;
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
    display: flex;
    gap: 22px;
    align-items: flex-end;
    padding: 8px 0 22px;
    flex-wrap: wrap;
  }
  .cv {
    width: 160px;
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 14px 30px -12px var(--shadow);
    flex: none;
  }
  .acts {
    display: flex;
    gap: 8px;
    margin-top: 16px;
  }
  .pill {
    padding: 9px 18px;
    border-radius: 99px;
    font-size: 14px;
    font-weight: 600;
    background: var(--ink);
    color: var(--bg);
  }
  .pill.ghost {
    background: var(--field);
    color: var(--ink);
  }
  .srow {
    display: grid;
    grid-template-columns: 32px minmax(0, 2fr) minmax(0, 1.3fr) auto;
    gap: 16px;
    align-items: center;
    width: 100%;
    text-align: left;
    padding: 14px;
    border-radius: 10px;
    font-size: 15px;
    min-height: 54px;
  }
  .srow + .srow {
    box-shadow: 0 -1px 0 var(--edge);
  }
  .srow:hover {
    background: var(--hover);
    box-shadow: none;
  }
  .n,
  .d {
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
    font-size: 14px;
    text-align: right;
  }
  .n {
    display: flex;
    justify-content: flex-end;
  }
  .ar {
    color: var(--ink-2);
  }
  .srow.cur {
    font-weight: 600;
  }
  .nm,
  .ar {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
