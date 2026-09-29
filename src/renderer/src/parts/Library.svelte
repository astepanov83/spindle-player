<script lang="ts">
  import LibraryChips from '../library/LibraryChips.svelte'
  import LibrarySidebar from '../library/LibrarySidebar.svelte'

  let { nav }: { nav: 'chips' | 'sidebar' } = $props()
</script>

<!-- with no songs each shows NoLibrary in place of the view, Radio still works -->
{#if nav === 'chips'}
  <LibraryChips />
{:else}
  <LibrarySidebar />
{/if}
