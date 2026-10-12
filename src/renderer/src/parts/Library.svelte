<script lang="ts">
  import LibraryChips from '../library/LibraryChips.svelte'
  import LibrarySidebar from '../library/LibrarySidebar.svelte'

  // lyrics: the song's words cover the page while shown (ticket 120)
  let { nav, lyrics = false }: { nav: 'chips' | 'sidebar'; lyrics?: boolean } = $props()
</script>

<!-- with no songs each shows NoLibrary in place of the view, Radio still works -->
{#if nav === 'chips'}
  <LibraryChips />
{:else}
  <LibrarySidebar {lyrics} />
{/if}
