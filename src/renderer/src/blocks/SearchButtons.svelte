<!-- A button for each other tab that searches wider (ticket 077): 'Search
     stations for "har"' sends the search text there. The caller lays them out. -->
<script lang="ts">
  import { searchWider } from '../plugins'
  import { searchLabel, type ShownTab } from '../plugins/tabs'
  import { library } from '../stores/library.svelte'

  let { tabs }: { tabs: ShownTab[] } = $props()
</script>

{#each tabs as t (t.id)}
  {@const label = searchLabel(t, library.query)}
  <button class="pill ghost wider" title={label} onclick={() => searchWider(t.id)}>{label}</button>
{/each}

<style>
  /* a long search text is cut, the tooltip has it all */
  .wider {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
