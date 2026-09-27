<!-- An album cover that fills its box, or a plain tile with a note when there is none. -->
<script lang="ts">
  import { icons } from './icons'

  let { src }: { src: string | undefined } = $props()

  // a cover the cache lost shows the plain tile, not a broken image
  let failed = $state('')
</script>

{#if src && failed !== src}
  <img
    class="cover"
    {src}
    alt=""
    loading="lazy"
    decoding="async"
    draggable="false"
    onerror={() => (failed = src)}
  />
{:else}
  <span class="cover none">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icons.note} /></svg>
  </span>
{/if}

<style>
  .cover {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .none {
    display: grid;
    place-items: center;
    background: var(--field);
    color: var(--ink-3);
  }
  svg {
    width: 36%;
    height: 36%;
    fill: currentColor;
    opacity: 0.7;
  }
</style>
