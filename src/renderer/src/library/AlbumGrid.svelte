<!-- Cover grid, drawn a row at a time so a big library stays fast. -->
<script lang="ts">
  import Empty from './Empty.svelte'
  import Cover from '../ui/Cover.svelte'
  import Eq from '../ui/Eq.svelte'
  import Icon from '../ui/Icon.svelte'
  import { chunk, filterAlbums, gridColumns } from './views'
  import { virtualList } from '../ui/virtual-list.svelte'
  import { library } from '../stores/library.svelte'
  import { queue } from '../stores/queue.svelte'

  let { scrollEl }: { scrollEl: HTMLElement | undefined } = $props()

  const GAP = 16
  const ROW_GAP = 22
  let list: HTMLDivElement | undefined = $state()
  let width = $state(0)

  const albums = $derived(filterAlbums(library.albums, library.query))
  const cols = $derived(gridColumns(width, 140, GAP))
  const rows = $derived(chunk(albums, cols))
  // cover + title + artist, measured for real once drawn
  const estimate = $derived((width - GAP * (cols - 1)) / cols + 44 + ROW_GAP)

  const v = virtualList(
    () => ({ count: rows.length, scrollEl, list, size: estimate, remeasure: true }),
    3
  )

  function measure(node: HTMLDivElement): void {
    v.measure(node)
  }
</script>

{#if !albums.length}
  <Empty title="No matches" text="Nothing found for this search. Try an album or artist name." />
{/if}
<div class="grid" bind:this={list} bind:clientWidth={width} style:height="{v.total}px">
  {#each v.items as item (item.key)}
    <div
      class="row"
      data-index={item.index}
      use:measure
      style:grid-template-columns="repeat({cols}, minmax(0, 1fr))"
      style:transform="translateY({v.offset(item)}px)"
    >
      {#each rows[item.index] as al (al.id)}
        <div class="card">
          <div class="cvwrap">
            <button class="cv" aria-label="Open {al.title}" onclick={() => (library.open = al.id)}
              ><Cover src={al.cover} /></button
            >
            <button
              class="qp"
              aria-label="Play {al.title}"
              onclick={() => queue.playAlbum(al.id, 0)}
            >
              <Icon name="play" />
            </button>
          </div>
          <div class="t">
            {#if al.id === queue.currentAlbum?.id}<Eq />{/if}<span>{al.title}</span>
          </div>
          <div class="a">{al.artist}</div>
        </div>
      {/each}
    </div>
  {/each}
</div>

<style>
  .grid {
    position: relative;
  }
  .row {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: grid;
    column-gap: 16px;
    padding-bottom: 22px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-align: left;
    min-width: 0;
  }
  .cvwrap {
    position: relative;
  }
  .cv {
    display: block;
    width: 100%;
    position: relative;
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 8px 20px -10px var(--shadow);
    transition: transform 0.2s;
  }
  .card:hover .cv {
    transform: translateY(-3px);
  }
  .qp {
    position: absolute;
    right: 8px;
    bottom: 8px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--ink);
    color: var(--bg);
    display: grid;
    place-items: center;
    opacity: 0;
    transform: translateY(6px);
    transition: 0.2s;
    box-shadow: 0 6px 14px var(--shadow);
  }
  .card:hover .qp,
  .card:focus-within .qp {
    opacity: 1;
    transform: none;
  }
  .t {
    font-size: 14px;
    font-weight: 600;
    display: flex;
    gap: 6px;
    align-items: center;
    min-width: 0;
  }
  .t span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .a {
    font-size: 13px;
    color: var(--ink-3);
    margin-top: -5px;
  }
</style>
