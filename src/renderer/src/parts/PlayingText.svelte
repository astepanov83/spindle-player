<!-- One line of what plays, with links (ticket 040): the title, each name
     and the group open the pages the item's plugin gives (the album at the
     song, each artist, the album; a station's name opens the Radio view).
     The same text as queues.title and queues.sub. -->
<script lang="ts">
  import GoLink from '../ui/GoLink.svelte'
  import { canOpen, openPage } from '../plugins'
  import type { PageAddress } from '../plugins/types'
  import { queues } from '../stores/queues.svelte'

  let { line }: { line: 'title' | 'sub' } = $props()

  const t = $derived(queues.info)
  const names = $derived(t ? (t.names ?? (t.subtitle ? [{ name: t.subtitle }] : [])) : [])
  const go = (to: PageAddress | undefined): (() => void) | undefined =>
    to && canOpen(to) ? () => openPage(to) : undefined

  // in the markup these would lose their spaces next to a block
  const comma = ', '
  const dot = ' · '
</script>

{#if t}
  {#if line === 'title'}
    <GoLink go={go(t.titleTo)}>{t.title}</GoLink>
  {:else}
    {#each names as a, i (i)}{#if i}{comma}{/if}<GoLink go={go(a.to)}>{a.name}</GoLink
      >{/each}{#if names.length && t.group}{dot}{/if}{#if t.group}<GoLink go={go(t.groupTo)}
        >{t.group}</GoLink
      >{/if}
  {/if}
{/if}
