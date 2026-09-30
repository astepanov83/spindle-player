<script lang="ts">
  import Cover from '../ui/Cover.svelte'
  import Eq from '../ui/Eq.svelte'
  import Icon from '../ui/Icon.svelte'
  import { fmtTime } from '../format'
  import { library } from '../stores/library.svelte'
  import { player } from '../stores/player.svelte'
  import { playing } from '../stores/playing.svelte'
  import { queue } from '../stores/queue.svelte'
  import { openSongMenu } from './song-menu'

  // back: the label of the link back (an artist's name when opened from them)
  let { albumId, back = 'All albums' }: { albumId: string; back?: string } = $props()

  const al = $derived(library.album(albumId))
  const tracks = $derived(al.trackIds.map((id) => library.track(id)))
  const minutes = $derived(Math.round(tracks.reduce((s, t) => s + t.duration, 0) / 60))

  function shufflePlay(): void {
    player.shuffle = true
    queue.playAlbum(al.id, Math.floor(Math.random() * tracks.length))
  }
</script>

<button class="back" onclick={() => (library.open = null)}
  ><Icon name="back" size={16} />{back}</button
>
<div class="albhead">
  <div class="cv"><Cover src={al.coverLarge} /></div>
  <div>
    <div class="page-meta">Album{al.year ? ` · ${al.year}` : ''}</div>
    <h2 class="page-title">{al.title}</h2>
    <div class="page-meta">{al.artist} · {tracks.length} songs · {minutes} min</div>
    <div class="acts">
      <button class="pill" onclick={() => queue.playAlbum(al.id, 0)}>Play</button>
      <button class="pill ghost" onclick={shufflePlay}>Shuffle</button>
      <button class="pill ghost" aria-haspopup="menu" onclick={(e) => openSongMenu(e, al.trackIds)}
        >Add to playlist</button
      >
    </div>
  </div>
</div>
<div>
  {#each tracks as t, i (t.id)}
    {@const cur = queue.isCurrent(t.id)}
    <button
      class="srow"
      class:cur
      onclick={() => queue.playAlbum(al.id, i)}
      oncontextmenu={(e) => openSongMenu(e, [t.id])}
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
