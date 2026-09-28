<!-- An artist's round picture: their photo when one was found online, else
     made from their covers (4 of them in a square, or the first), else the
     grey record. -->
<script lang="ts">
  import Cover from '../ui/Cover.svelte'
  import { library } from '../stores/library.svelte'

  let { photo, covers }: { photo: string | undefined; covers: string[] } = $props()

  // a photo the cache lost shows the covers, not a broken image. Only until
  // the next load: a scan can make its small file again at the same URL.
  let failed = $state({ url: '', load: -1 })
  const broken = $derived(failed.url === photo && failed.load === library.revision)
</script>

<span class="pic">
  {#if photo && !broken}
    <img
      src={photo}
      alt=""
      loading="lazy"
      decoding="async"
      draggable="false"
      onerror={() => (failed = { url: photo ?? '', load: library.revision })}
    />
  {:else if covers.length >= 4}
    <span class="four">
      {#each covers.slice(0, 4) as c (c)}<Cover src={c} />{/each}
    </span>
  {:else}
    <Cover src={covers[0]} />
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
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
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
