<!-- One line of what plays, with links (ticket 040): the title, each name
     and the group open the pages the item's plugin gives (the album at the
     song, each artist, the album; a station's name opens the Radio view).
     The same text as queues.title and queues.sub. A song that can't play
     shows why instead of its names, as a link to its plugin's settings. -->
<script lang="ts">
  import GoLink from '../ui/GoLink.svelte'
  import { canOpen, openPage } from '../plugins'
  import type { PageAddress } from '../plugins/types'
  import { layout } from '../stores/layout.svelte'
  import { queues } from '../stores/queues.svelte'
  import { splitKey } from '../../../shared/plugins/items'

  let { line }: { line: 'title' | 'sub' } = $props()

  const t = $derived(queues.info)
  const names = $derived(t ? (t.names ?? (t.subtitle ? [{ name: t.subtitle }] : [])) : [])
  const go = (to: PageAddress | undefined): (() => void) | undefined =>
    to && canOpen(to) ? () => openPage(to) : undefined
  const settingsOf = (): void => layout.openSettings(splitKey(queues.item ?? '')?.plugin)

  // in the markup these would lose their spaces next to a block
  const comma = ', '
  const dot = ' · '
</script>

{#if t}
  {#if line === 'title'}
    <GoLink go={go(t.titleTo)}>{t.title}</GoLink>
  {:else if t.unavailable}
    <span class="away"
      ><span class="mark">!</span><GoLink go={settingsOf}>{t.unavailable}</GoLink></span
    >
  {:else}
    {#each names as a, i (i)}{#if i}{comma}{/if}<GoLink go={go(a.to)}>{a.name}</GoLink
      >{/each}{#if names.length && t.group}{dot}{/if}{#if t.group}<GoLink go={go(t.groupTo)}
        >{t.group}</GoLink
      >{/if}
  {/if}
{/if}

<style>
  .away {
    color: var(--warn);
  }
  .mark {
    margin-right: 6px;
    font-weight: 800;
  }
</style>
