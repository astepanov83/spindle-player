<!-- The MFP chip and section (ticket 052): Music For Programming episodes,
     newest first, or the open episode. The search box filters the list in
     place; a song match shows under its episode. -->
<script lang="ts">
  import Empty from './Empty.svelte'
  import EpisodePage from './EpisodePage.svelte'
  import ViewHead from './ViewHead.svelte'
  import Eq from '../ui/Eq.svelte'
  import Thumb from '../ui/Thumb.svelte'
  import { fmtCount, fmtLength } from '../format'
  import { roving } from '../ui/roving'
  import { mfpLine } from './scan-text'
  import { episodeRows } from './views'
  import { library } from '../stores/library.svelte'
  import { playing } from '../stores/playing.svelte'
  import { queue } from '../stores/queue.svelte'
  import { pluginOn } from '../stores/settings.svelte'

  const rows = $derived(episodeRows(library.mfpAlbums, (id) => library.track(id), library.query))
  const status = $derived(mfpLine(library.status.mfp, Date.now()))
  // every song under an episode, in order, for the arrow keys
  const keyRows = $derived(rows.flatMap((r) => [r.album, ...r.songs]))

  const length = (trackIds: string[]): number =>
    trackIds.reduce((s, id) => s + library.track(id).duration, 0)

  // the episode is the queue, from this song on
  function play(albumId: string, id: string): void {
    queue.playAlbum(albumId, library.album(albumId).trackIds.indexOf(id))
  }
</script>

{#if !pluginOn('mfp')}
  <Empty
    title="Music For Programming is off"
    text="Turn it on in Settings, under Online music, to play the mixes from musicforprogramming.net."
  />
{:else if library.episode}
  <EpisodePage albumId={library.episode} />
{:else}
  <ViewHead
    title="Music For Programming"
    meta="Online"
    count={fmtCount(library.mfpAlbums.length, 'episode', 'episodes')}
    hint={library.status.mfp?.running || library.status.mfp?.error ? status : undefined}
  />
  {#if !library.mfpAlbums.length}
    <Empty
      title="No episodes yet"
      text={library.status.mfp?.running
        ? 'Reading musicforprogramming.net…'
        : 'They show here once musicforprogramming.net has been read. Rescan in Settings tries again.'}
    />
  {:else if !rows.length}
    <Empty title="No matches" text="No episode, mixer or song has that in its name." />
  {:else}
    <div class="lines" use:roving={{ rows: keyRows }}>
      {#each rows as r (r.album.id)}
        {@const al = r.album}
        <button class="ep row" data-row onclick={() => library.openEpisode(al.id)}>
          <Thumb src={al.cover} size={40} radius={4} />
          <span class="nm" title={al.title}>{al.title}</span>
          <span class="o">{al.year || ''}</span>
          <span class="o">{fmtCount(al.trackIds.length, 'song', 'songs')}</span>
          <span class="d">{fmtLength(length(al.trackIds))}</span>
        </button>
        {#each r.songs as t (t.id)}
          {@const cur = playing.isSong(t.id)}
          <button
            class="song row"
            class:cur-row={cur}
            data-row
            data-song={t.id}
            aria-current={cur ? 'true' : undefined}
            onclick={() => play(al.id, t.id)}
          >
            <span class="nm"
              >{#if cur && playing.songPlaying}<Eq />{/if}<span title={t.title}>{t.title}</span
              ></span
            >
            <span class="o" title={t.artist}>{t.artist}</span>
          </button>
        {/each}
      {/each}
    </div>
  {/if}
{/if}

<style>
  .ep {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto auto 5.5em;
    gap: 16px;
    align-items: center;
    width: 100%;
    padding: 8px 14px;
    min-height: 56px;
    font-size: var(--text-l);
  }
  .song {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1.3fr);
    gap: 16px;
    align-items: center;
    width: 100%;
    padding: 8px 14px 8px 70px;
    min-height: 40px;
    font-size: var(--text-m);
  }
  .nm {
    display: flex;
    gap: 6px;
    align-items: center;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .nm span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cur-row .nm {
    font-weight: 600;
  }
  .o,
  .d {
    color: var(--ink-3);
    font-size: var(--text-m);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .d {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
