<script lang="ts">
  import LibraryChips from '../library/LibraryChips.svelte'
  import LibrarySidebar from '../library/LibrarySidebar.svelte'

  let { nav }: { nav: 'chips' | 'sidebar' } = $props()
</script>

{#if nav === 'chips'}
  <LibraryChips />
{:else}
  <LibrarySidebar />
{/if}
