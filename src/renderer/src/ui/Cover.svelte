<!-- An album cover that fills its box. With none, a picture made from the item
     in the style Settings picks (ticket 103), or the grey record. -->
<script lang="ts">
  import type { NoCover } from '../../../shared/settings'
  import type { PictureArt } from '../../../shared/library'
  import { bucketOf, cachedPicture, loadPicture, pictureKey } from '../no-cover/pictures'
  import { settings } from '../stores/settings.svelte'
  import { theme } from '../stores/theme.svelte'

  let {
    src,
    art,
    tint,
    lazy = true,
    onfail,
    style
  }: {
    src: string | undefined
    // what a picture is made from when there is no cover (or it fails)
    art?: PictureArt
    // shown while the picture loads (a CSS background): the album's color
    // turns into its cover, which a fast scroll shows much less than grey does
    tint?: string
    // off in the virtual grids: their rows are only drawn near the view anyway,
    // and lazy loading only waits longer to ask
    lazy?: boolean
    // the picture could not be loaded; the plain tile shows meanwhile
    onfail?: () => void
    // in place of the setting's (Settings' previews)
    style?: NoCover
  } = $props()

  // a cover the cache lost shows the plain tile, not a broken image
  let failed = $state('')
  // A plain tile until the picture is in, so a station's logo from the web
  // doesn't show as a blank gap first. Taken away after, for logos with holes.
  let loaded = $state('')

  const showCover = $derived(!!src && failed !== src)
  const drawn = $derived(style ?? settings.noCover)
  const seed = $derived(art?.seed)
  const made = $derived(!showCover && drawn !== 'record' && !!seed)
  // the box's width picks the size the picture is drawn at
  let width = $state(0)
  const themeName = $derived(theme.light ? 'light' : 'dark')
  const key = $derived(
    made && seed && width ? pictureKey(drawn, seed, themeName, bucketOf(width)) : ''
  )
  // the last drawing that came in; a cached one shows at once
  let drawnPic = $state({ key: '', url: '' })
  const pic = $derived(
    key && drawnPic.key === key ? drawnPic.url : key ? (cachedPicture(key) ?? '') : ''
  )
  const ground = $derived(tint ?? art?.palette?.[themeName][0])

  $effect(() => {
    if (!key || pic || !seed) return
    const k = key
    let live = true
    void loadPicture(k, drawn, { ...art, seed }, themeName, bucketOf(width)).then((url) => {
      if (live && url) drawnPic = { key: k, url }
    })
    return () => (live = false)
  })
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
{:else if made}
  <!-- the item's color while its picture is drawn -->
  <span class="cover made" style:background={pic ? undefined : ground} bind:clientWidth={width}
    >{#if pic}<img class="cover" src={pic} alt="" decoding="async" draggable="false" />{/if}</span
  >
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
  .wait,
  .made {
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
