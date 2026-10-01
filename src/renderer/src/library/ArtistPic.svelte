<!-- An artist's round picture: their photo when one was found online, else
     made from their covers (4 of them in a square, or the first), else the
     grey record. -->
<script lang="ts">
  import Cover from '../ui/Cover.svelte'
  import { mosaicUrl } from '../../../shared/library'
  import type { CoverArt } from './artists'
  import { library } from '../stores/library.svelte'
  import { theme } from '../stores/theme.svelte'

  let { photo, covers }: { photo: string | undefined; covers: CoverArt[] } = $props()

  // The 4 covers as one picture main makes, so a tile loads 1 image, not 4.
  const four = $derived(covers.length >= 4 ? covers.slice(0, 4) : undefined)
  const mosaic = $derived(four && mosaicUrl(four.map((c) => c.cover)))

  // Pictures that failed: a photo the cache lost shows the covers, a mosaic
  // that can't be made shows the 4 covers, not a broken image. Only until the
  // next library or patch: a scan can make its small file again at the same URL.
  let failed = $state.raw({ urls: [] as string[], load: -1 })
  const ok = (url: string | undefined): url is string =>
    !!url && !(failed.load === library.revision && failed.urls.includes(url))
  function fail(url: string): void {
    const before = failed.load === library.revision ? failed.urls : []
    failed = { urls: [...before, url], load: library.revision }
  }

  const tone = (c: CoverArt): string => c.palette[theme.light ? 'light' : 'dark'][0]
  // the 4 colors in their places while the mosaic loads, clockwise from the top right
  const mosaicTint = $derived(
    four &&
      `conic-gradient(${tone(four[1])} 0 25%, ${tone(four[3])} 0 50%, ${tone(four[2])} 0 75%, ${tone(four[0])} 0)`
  )
</script>

<span class="pic">
  {#if ok(photo)}
    <Cover src={photo} lazy={false} onfail={() => fail(photo)} />
  {:else if ok(mosaic)}
    <Cover src={mosaic} tint={mosaicTint} lazy={false} onfail={() => fail(mosaic)} />
  {:else if four}
    <span class="four">
      {#each four as c (c.cover)}<Cover src={c.cover} tint={tone(c)} lazy={false} />{/each}
    </span>
  {:else}
    <Cover src={covers[0]?.cover} tint={covers[0] && tone(covers[0])} lazy={false} />
  {/if}
</span>

<style>
  .pic {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    overflow: hidden;
    background: var(--field);
  }
  .four {
    display: grid;
    grid-template: 1fr 1fr / 1fr 1fr;
    width: 100%;
    height: 100%;
  }
  .four :global(.cover) {
    min-height: 0;
  }
</style>
