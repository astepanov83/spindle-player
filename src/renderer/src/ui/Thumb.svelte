<!-- A small cover, optionally with the eq bars or a pulsing dot (a station connecting) on top. -->
<script lang="ts">
  import Cover from './Cover.svelte'
  import Eq from './Eq.svelte'

  let {
    src,
    size = 44,
    radius = 6,
    eq = false,
    busy = false
  }: {
    src: string | undefined
    size?: number
    radius?: number
    eq?: boolean
    busy?: boolean
  } = $props()
</script>

<span class="mini" style:width="{size}px" style:height="{size}px" style:border-radius="{radius}px">
  <Cover {src} />
  {#if eq}<span class="on-cover"><Eq /></span>
  {:else if busy}<span class="on-cover corner"><span class="dot">●</span></span>{/if}
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
  @keyframes pulse {
    to {
      opacity: 0.35;
    }
  }
</style>
