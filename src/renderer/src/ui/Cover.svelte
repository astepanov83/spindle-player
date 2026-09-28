<!-- An album cover that fills its box, or a grey record when there is none. -->
<script lang="ts">
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
    <!-- the record from build/icon.svg, in the theme's inks -->
    <svg viewBox="78 78 356 356" aria-hidden="true">
      <circle cx="256" cy="256" r="178" fill="currentColor" opacity="0.35" />
      <circle cx="256" cy="256" r="150" fill="none" stroke="var(--field)" stroke-width="4" />
      <circle cx="256" cy="256" r="122" fill="none" stroke="var(--field)" stroke-width="4" />
      <circle cx="256" cy="256" r="72" fill="currentColor" opacity="0.6" />
      <circle cx="256" cy="256" r="16" fill="var(--field)" />
    </svg>
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
    width: 70%;
    height: 70%;
  }
</style>
