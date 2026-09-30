<!-- One line of what plays, with links (ticket 040): the title opens the
     album at the song, each artist their page, the album its page, a station
     name the Radio view. The same text as playing.title and playing.sub. -->
<script lang="ts">
  import GoLink from '../ui/GoLink.svelte'
  import { artistLinks } from '../library/artists'
  import { library } from '../stores/library.svelte'
  import { playing } from '../stores/playing.svelte'
  import { queue } from '../stores/queue.svelte'
  import { radio } from '../stores/radio.svelte'

  let { line }: { line: 'title' | 'sub' } = $props()

  const t = $derived(playing.kind === 'queue' ? queue.current : undefined)
  const artists = $derived(t ? artistLinks(t, (key) => !!library.getArtist(key)) : [])
  const showRadio = (): void => library.showRadio()

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
    <GoLink go={() => library.showAlbum(t.albumId, t.id)}>{t.title}</GoLink>
  {:else}
    {#each artists as a, i (i)}{#if i}{comma}{/if}<GoLink
        go={a.key ? () => library.showArtist(a.key!) : undefined}>{a.name}</GoLink
      >{/each}{dot}<GoLink go={() => library.showAlbum(t.albumId)}>{t.album}</GoLink>
  {/if}
{/if}
