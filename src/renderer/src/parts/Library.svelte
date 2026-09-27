<script lang="ts">
  import LibraryChips from '../library/LibraryChips.svelte'
  import LibrarySidebar from '../library/LibrarySidebar.svelte'
  import NoLibrary from '../library/NoLibrary.svelte'
  import { library } from '../stores/library.svelte'

  let { nav }: { nav: 'chips' | 'sidebar' } = $props()
</script>

{#if !library.albums.length}
  <NoLibrary />
{:else if nav === 'chips'}
  <LibraryChips />
{:else}
  <LibrarySidebar />
{/if}
