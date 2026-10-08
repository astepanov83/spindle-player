<!-- A heading row over a run of tiles (ticket 096): a letter, a decade, a
     time, or an album artist with their picture, count and play button,
     whose name opens their page. -->
<script lang="ts">
  import ArtistPic from '../library/ArtistPic.svelte'
  import type { Heading } from '../library/groups'
  import { songMenu } from '../library/song-menu'
  import Icon from '../ui/Icon.svelte'
  import { openFrom } from '../plugins'
  import type { ArtistHeading } from '../plugins/types'
  import { menu } from '../stores/menu.svelte'
  import { queue } from '../stores/queue.svelte'

  let {
    heading: h,
    artist,
    tab,
    tabbable = true
  }: {
    heading: Heading
    artist: ArtistHeading | undefined
    tab: string
    // off in a list, which is one Tab stop; 'name': only the name is (the
    // shelf holding the Tab stop)
    tabbable?: boolean | 'name'
  } = $props()

  const tabindex = $derived(tabbable ? undefined : -1)
  const playTab = $derived(tabbable === true ? undefined : -1)

  function openMenu(e: MouseEvent, a: ArtistHeading): void {
    menu.showFor(e, songMenu(a.songs(), { from: a.from, link: a.link }))
  }
</script>

{#snippet who(a: ArtistHeading)}
  <span class="pic"><ArtistPic name={h.title} photo={a.photo} covers={a.covers} /></span>
  <span class="words">
    <span class="name" title={h.title}>{h.title}</span>
    <span class="sub">{a.sub}</span>
  </span>
{/snippet}

{#if artist}
  {@const a = artist}
  <div class="head artist" role="group" aria-label={h.title} oncontextmenu={(e) => openMenu(e, a)}>
    {#if a.to}
      {@const to = a.to}
      <button class="who" data-name {tabindex} onclick={() => openFrom(tab, to)}
        >{@render who(a)}</button
      >
    {:else}
      <div class="who">{@render who(a)}</div>
    {/if}
    <button
      class="play"
      tabindex={playTab}
      aria-label="Play {h.title}"
      onclick={() => queue.playList(a.songs(), 0, a.from, a.link)}
    >
      <Icon name="play" size={14} />
    </button>
    <span class="rule"></span>
  </div>
{:else}
  <div class="head">
    <h3 title={h.title}>{h.title}</h3>
    <span class="rule"></span>
  </div>
{/if}

<style>
  .head {
    height: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  /* sits close over its own tiles, away from the row above */
  .head:not(.artist) {
    padding-top: 6px;
  }
  h3 {
    margin: 0;
    font-size: var(--title-s);
    font-weight: 700;
    line-height: 1.3;
    white-space: nowrap;
  }
  .rule {
    flex: 1;
    min-width: 12px;
    height: 1px;
    background: var(--edge);
  }
  .who {
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    min-width: 0;
  }
  .pic {
    width: 44px;
    height: 44px;
    flex: none;
    border-radius: 50%;
  }
  .words {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name {
    font-size: var(--title-s);
    font-weight: 700;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  button.who:hover .name {
    text-decoration: underline;
  }
  .sub {
    font-size: var(--text-s);
    line-height: 1.3;
    color: var(--ink-3);
  }
  .play {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--field);
    color: var(--ink);
    flex: none;
  }
  .play:hover {
    background: var(--ink);
    color: var(--bg);
  }
</style>
