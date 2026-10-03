<!-- One line of what plays, with links (ticket 040): the title, each name
     and the group open the pages the song's plugin gives (the album at the
     song, each artist, the album), a station name the Radio view. The same
     text as playing.title and playing.sub. -->
<script lang="ts">
  import GoLink from '../ui/GoLink.svelte'
  import { canOpen, openPage } from '../plugins'
  import type { PageAddress } from '../plugins/types'
  import { library } from '../stores/library.svelte'
  import { playing } from '../stores/playing.svelte'
  import { queue } from '../stores/queue.svelte'
  import { radio } from '../stores/radio.svelte'

  let { line }: { line: 'title' | 'sub' } = $props()

  const t = $derived(playing.kind === 'queue' ? queue.currentInfo : undefined)
  const names = $derived(t ? (t.names ?? (t.subtitle ? [{ name: t.subtitle }] : [])) : [])
  // radio is no plugin page yet (ticket 057)
  const showRadio = (): void => library.showRadio()
  const go = (to: PageAddress | undefined): (() => void) | undefined =>
    to && canOpen(to) ? () => openPage(to) : undefined

  // in the markup these would lose their spaces next to a block
  const comma = ', '
  const dot = ' · '
</script>

{#if playing.kind === 'radio'}
  {#if radio.station}
    {#if line === 'title'}
      {#if radio.now.track}{radio.now.track}{:else}<GoLink go={showRadio}
          >{radio.station.name}</GoLink
        >{/if}
    {:else if radio.now.track}<GoLink go={showRadio}>{radio.station.name}</GoLink>{:else}Radio{/if}
  {/if}
{:else if t}
  {#if line === 'title'}
    <GoLink go={go(t.titleTo)}>{t.title}</GoLink>
  {:else}
    {#each names as a, i (i)}{#if i}{comma}{/if}<GoLink go={go(a.to)}>{a.name}</GoLink
      >{/each}{#if names.length && t.group}{dot}{/if}{#if t.group}<GoLink go={go(t.groupTo)}
        >{t.group}</GoLink
      >{/if}
  {/if}
{/if}
