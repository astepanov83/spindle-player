<!-- A small cover, optionally with the eq bars on top. -->
<script lang="ts">
  import Eq from './Eq.svelte'

  let {
    src,
    size = 44,
    radius = 6,
    eq = false
  }: { src: string; size?: number; radius?: number; eq?: boolean } = $props()
</script>

<span
  class="mini"
  style:background-image="url({src})"
  style:width="{size}px"
  style:height="{size}px"
  style:border-radius="{radius}px"
>
  {#if eq}<span class="on-cover"><Eq /></span>{/if}
</span>

<style>
  .mini {
    position: relative;
    background-size: cover;
    display: grid;
    place-items: center;
    flex: none;
  }
  /* sits on the cover image, not on the theme */
  .on-cover {
    display: grid;
    color: #fff;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
  }
</style>
