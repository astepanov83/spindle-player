<!-- An artist's round picture: their photo when one was found online, else
     made from their covers (4 of them in a square, or the first), else the
     grey record. -->
<script lang="ts">
  import Cover from '../ui/Cover.svelte'

  let { photo, covers }: { photo: string | undefined; covers: string[] } = $props()

  // a photo the cache lost shows the covers, not a broken image
  let failed = $state('')
</script>

<span class="pic">
  {#if photo && failed !== photo}
    <img
      src={photo}
      alt=""
      loading="lazy"
      decoding="async"
      draggable="false"
      onerror={() => (failed = photo ?? '')}
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
