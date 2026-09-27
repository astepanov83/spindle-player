<script lang="ts">
  import Eq from '../ui/Eq.svelte'
  import Icon from '../ui/Icon.svelte'
  import { fmtTime } from '../format'
  import { library } from '../stores/library.svelte'
  import { player } from '../stores/player.svelte'
  import { queue } from '../stores/queue.svelte'

  let { albumId }: { albumId: string } = $props()

  const al = $derived(library.album(albumId))
  const tracks = $derived(al.trackIds.map((id) => library.track(id)))
  const minutes = $derived(Math.round(tracks.reduce((s, t) => s + t.duration, 0) / 60))

  function shufflePlay(): void {
    player.shuffle = true
    queue.playAlbum(al.id, Math.floor(Math.random() * tracks.length))
  }
</script>

<button class="back" onclick={() => (library.open = null)}
  ><Icon name="back" size={16} />All albums</button
>
<div class="albhead">
  <div class="cv" style:background-image="url({al.cover})"></div>
  <div>
    <div class="m">Album · {al.year}</div>
    <h2>{al.title}</h2>
    <div class="m">{al.artist} · {tracks.length} songs · {minutes} min</div>
    <div class="acts">
      <button class="pill" onclick={() => queue.playAlbum(al.id, 0)}>Play</button>
      <button class="pill ghost" onclick={shufflePlay}>Shuffle</button>
    </div>
  </div>
</div>
<div>
  {#each tracks as t, i (t.id)}
    {@const cur = queue.isCurrent(t.id)}
    <button class="srow" class:cur onclick={() => queue.playAlbum(al.id, i)}>
      <span class="n"
        >{#if cur && player.playing}<Eq />{:else}{i + 1}{/if}</span
      >
      <span class="nm">{t.title}</span>
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
    background-size: cover;
    box-shadow: 0 14px 30px -12px var(--shadow);
    flex: none;
  }
  h2 {
    font-family: var(--display);
    font-size: 32px;
    margin: 4px 0 8px;
    letter-spacing: -0.02em;
    line-height: 1.05;
    text-wrap: balance;
  }
  .m {
    color: var(--ink-3);
    font-size: 13px;
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
    grid-template-columns: 32px 1fr auto;
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
  .srow.cur {
    font-weight: 600;
  }
  .nm {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
