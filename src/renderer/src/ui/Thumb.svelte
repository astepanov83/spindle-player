<!-- A small cover, optionally with the eq bars, a pulsing dot (a station connecting)
     or a "!" (a song that can't play: its music folder was not found) on top. -->
<script lang="ts">
  import type { PictureArt } from '../../../shared/library'
  import Cover from './Cover.svelte'
  import Eq from './Eq.svelte'

  let {
    src,
    art,
    size = 44,
    radius = 6,
    eq = false,
    busy = false,
    away = false
  }: {
    src: string | undefined
    // what a picture is made from when there is no cover
    art?: PictureArt
    size?: number
    radius?: number
    eq?: boolean
    busy?: boolean
    away?: boolean
  } = $props()
</script>

<span class="mini" style:width="{size}px" style:height="{size}px" style:border-radius="{radius}px">
  <Cover {src} {art} />
  {#if eq}<span class="on-cover"><Eq /></span>
  {:else if busy}<span class="on-cover corner"><span class="dot">●</span></span>
  {:else if away}<span class="on-cover corner"><span class="away">!</span></span>{/if}
</span>

<style>
  .mini {
    position: relative;
    overflow: hidden;
    flex: none;
  }
  .on-cover {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--on-cover);
    filter: drop-shadow(0 1px 2px var(--on-cover-shadow));
  }
  /* in a corner on a dark disc: in the centre it read as the placeholder
     vinyl's hole. A fade, not a movement, for reduced motion. */
  .corner {
    place-items: end;
    padding: 3px;
  }
  .dot {
    display: grid;
    place-items: center;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--on-cover-shadow);
    font-size: 8px;
    line-height: 1;
    animation: pulse 0.9s ease-in-out infinite alternate;
  }
  .away {
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--warn);
    color: var(--bg);
    font-size: 11px;
    font-weight: 800;
    line-height: 1;
  }
  @keyframes pulse {
    to {
      opacity: 0.35;
    }
  }
</style>
