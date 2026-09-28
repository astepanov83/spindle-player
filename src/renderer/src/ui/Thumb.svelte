<!-- A small cover, optionally with the eq bars on top. -->
<script lang="ts">
  import Cover from './Cover.svelte'
  import Eq from './Eq.svelte'

  let {
    src,
    size = 44,
    radius = 6,
    eq = false
  }: { src: string | undefined; size?: number; radius?: number; eq?: boolean } = $props()
</script>

<span class="mini" style:width="{size}px" style:height="{size}px" style:border-radius="{radius}px">
  <Cover {src} />
  {#if eq}<span class="on-cover"><Eq /></span>{/if}
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
</style>
