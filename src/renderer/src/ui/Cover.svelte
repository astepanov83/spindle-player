<!-- An album cover that fills its box, or a grey record when there is none. -->
<script lang="ts">
  let {
    src,
    tint,
    lazy = true,
    onfail
  }: {
    src: string | undefined
    // shown while the picture loads (a CSS background): the album's color
    // turns into its cover, which a fast scroll shows much less than grey does
    tint?: string
    // off in the virtual grids: their rows are only drawn near the view anyway,
    // and lazy loading only waits longer to ask
    lazy?: boolean
    // the picture could not be loaded; the plain tile shows meanwhile
    onfail?: () => void
  } = $props()

  // a cover the cache lost shows the plain tile, not a broken image
  let failed = $state('')
  // A plain tile until the picture is in, so a station's logo from the web
  // doesn't show as a blank gap first. Taken away after, for logos with holes.
  let loaded = $state('')
</script>

{#if src && failed !== src}
  <img
    class="cover"
    class:wait={loaded !== src}
    style:background={loaded !== src ? tint : undefined}
    {src}
    alt=""
    loading={lazy ? 'lazy' : 'eager'}
    decoding="async"
    draggable="false"
    onload={() => (loaded = src)}
    onerror={() => {
      failed = src
      onfail?.()
    }}
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
  .wait {
    background: var(--field);
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
