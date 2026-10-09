<!-- Renders one node of the built layout: a box, a part, or tabs. Calls itself for children. -->
<script lang="ts">
  import Node from './Node.svelte'
  import Drawer from './Drawer.svelte'
  import Controls from '../parts/Controls.svelte'
  import Library from '../parts/Library.svelte'
  import NowPlaying from '../parts/NowPlaying.svelte'
  import Queue from '../parts/Queue.svelte'
  import { layout } from '../stores/layout.svelte'
  import { tabStep } from '../keys'
  import { queue } from '../stores/queue.svelte'
  import { dropTarget, type DropTarget } from '../stores/song-drag.svelte'
  import type { BuiltNode } from './build'

  let { node }: { node: BuiltNode } = $props()
  const uid = $props.id()

  // Songs dropped on the Queue tab go at the end (ticket 089); resting on it
  // opens it, to drop them at a place.
  const onQueueTab: DropTarget = {
    drop: (d) => queue.append(d.keys, d.from, d.link),
    rest: () => (layout.tabSel = 1)
  }

  // One Tab stop; Left and Right pick the next tab, as in any tab row.
  function ontabkey(e: KeyboardEvent & { currentTarget: HTMLElement }, i: number): void {
    if (node.kind !== 'tabs' || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    const to = tabStep(e.key, i, node.labels.length)
    if (to === null) return
    e.preventDefault()
    layout.tabSel = to
    ;(e.currentTarget.parentElement?.children[to] as HTMLElement | undefined)?.focus()
  }
</script>

{#snippet drawer()}
  {#if node.drawer}<Drawer fill={node.drawer === 'fill'} />{/if}
{/snippet}

{#if node.kind === 'box'}
  <div
    class="box dir-{node.dir}"
    class:look-tint={node.look === 'tint'}
    class:look-ambient={node.look === 'ambient'}
    class:dhost={!!node.drawer}
    style:flex={node.flex}
    style:--content-max={node.contentWidth}
  >
    {#if node.look === 'ambient'}
      <div class="amb-bg" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="amb-shade" aria-hidden="true"></div>
    {/if}
    {#each node.children as child, i (i)}
      <Node node={child} />
    {/each}
    {@render drawer()}
  </div>
{:else if node.kind === 'tabs'}
  <div class="tabsbox" class:dhost={!!node.drawer} style:flex={node.flex}>
    <!-- Focus's notice sits under it (ui/Notice.svelte) -->
    <div class="tabstrip" role="tablist" data-notice-under>
      {#each node.labels as label, i (i)}
        <button
          role="tab"
          id="{uid}-tab{i}"
          aria-selected={layout.tabSel === i}
          aria-controls="{uid}-pane{i}"
          tabindex={layout.tabSel === i ? 0 : -1}
          onclick={() => (layout.tabSel = i)}
          onkeydown={(e) => ontabkey(e, i)}
          use:dropTarget={i === 1 ? onQueueTab : undefined}>{label}</button
        >
      {/each}
    </div>
    {#each node.panes as pane, i (i)}
      <div
        class="tabpane"
        role="tabpanel"
        id="{uid}-pane{i}"
        aria-labelledby="{uid}-tab{i}"
        hidden={layout.tabSel !== i}
      >
        <Node node={pane} />
      </div>
    {/each}
    {@render drawer()}
  </div>
{:else}
  {@const p = node.part}
  <div
    class="part"
    class:part-queue={p.part === 'queue'}
    class:dhost={!!node.drawer}
    style:flex={node.flex}
  >
    {#if p.part === 'library'}
      <Library nav={p.opts.nav} />
    {:else if p.part === 'nowplaying'}
      <NowPlaying style={p.opts.style} show={p.opts.show} />
    {:else if p.part === 'controls'}
      <Controls style={p.opts.style} />
    {:else}
      <Queue header={p.opts.header} close={p.opts.close} />
    {/if}
    {@render drawer()}
  </div>
{/if}

<style>
  .box {
    display: flex;
    min-width: 0;
    min-height: 0;
    position: relative;
  }
  .dir-row {
    flex-direction: row;
  }
  .dir-col {
    flex-direction: column;
  }
  /* lines between parts */
  .dir-row > :global(* + *) {
    border-left: 1px solid var(--edge);
  }
  .dir-col > :global(* + *) {
    border-top: 1px solid var(--edge);
  }
  /* none on a look, nor in a box inside an ambient one (Focus's wide layout) */
  .look-tint > :global(*),
  .look-ambient > :global(*),
  :global(.look-ambient) .box > :global(*) {
    border: 0 !important;
  }
  .part {
    position: relative;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .dir-row > :global(.part-queue) {
    background: var(--bg-side);
  }
  .dhost {
    position: relative;
  }
  /* Focus's wide layout: while the words show alone above the controls, the
     controls take as much height as the words' pane, so the two meet in the
     middle, by the cover. The Queue tab or an open drawer gets the height back. */
  .dir-col:global(:has(> .tabsbox > .tabpane:not([hidden]) > .part > .only-text))
    > :global(.part:last-child),
  .dir-col:global(:has(> .part > .only-text):not(:has(.drawer.open))) > :global(.part:last-child) {
    flex: 1 1 0;
  }

  .look-tint {
    background: linear-gradient(
      170deg,
      color-mix(
          in oklch,
          oklch(from var(--c1) min(l, var(--tint-max-l)) c h) var(--tint),
          var(--bg)
        )
        0%,
      color-mix(in oklch, var(--c3) calc(var(--tint) / 2), var(--bg)) 55%,
      var(--bg) 100%
    );
  }
  .look-ambient {
    background: var(--bg);
    overflow: hidden;
  }
  .look-ambient > :global(:not(.amb-bg):not(.amb-shade)) {
    position: relative;
    z-index: 1;
  }
  .amb-bg {
    position: absolute;
    inset: -20%;
    filter: blur(60px) saturate(1.3);
    opacity: 0.95;
  }
  .amb-bg i {
    position: absolute;
    width: 60%;
    height: 60%;
    border-radius: 50%;
    transition: background 1.2s;
  }
  .amb-bg i:nth-child(1) {
    background: var(--c1);
    left: 5%;
    top: 5%;
    animation: driftA 18s ease-in-out infinite alternate;
  }
  .amb-bg i:nth-child(2) {
    background: var(--c2);
    right: 0;
    top: 30%;
    animation: driftB 22s ease-in-out infinite alternate;
  }
  .amb-bg i:nth-child(3) {
    background: var(--c3);
    left: 20%;
    bottom: 0;
    animation: driftC 26s ease-in-out infinite alternate;
  }
  /* Moving blobs make the blur be drawn again every frame: on the CPU that
     took Focus from 60 to 8 fps. Still, it is drawn once and kept.
     After the blobs' own rules, which are as specific. */
  :global(.no-gpu) .amb-bg i {
    animation: none;
  }
  @keyframes driftA {
    to {
      transform: translate(25%, 20%) scale(1.2);
    }
  }
  @keyframes driftB {
    to {
      transform: translate(-30%, -15%) scale(0.9);
    }
  }
  @keyframes driftC {
    to {
      transform: translate(15%, -25%) scale(1.15);
    }
  }
  .amb-shade {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--bg) var(--wash-top), transparent),
      color-mix(in srgb, var(--bg) var(--wash-bottom), transparent)
    );
  }

  .tabsbox {
    display: flex;
    flex-direction: column;
    min-height: 0;
    position: relative;
  }
  .tabstrip {
    display: flex;
    gap: 3px;
    /* 20px from the edges, or --content-max wide in the middle */
    margin: 14px max(20px, (100% - var(--content-max, 100%)) / 2) 4px;
    background: var(--well);
    border-radius: 10px;
    padding: 3px;
    flex: none;
  }
  .tabstrip button {
    flex: 1;
    font-size: var(--text-s);
    font-weight: 500;
    padding: 7px 0;
    border-radius: 8px;
    color: var(--ink-2);
    text-align: center;
    transition:
      background 0.15s,
      color 0.15s;
  }
  .tabstrip button:hover {
    background: var(--hover);
    color: var(--ink);
  }
  .tabstrip button[aria-selected='true'] {
    background: var(--raised);
    color: var(--ink);
  }
  .tabpane {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .tabpane > :global(.part) {
    flex: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .amb-bg i {
      animation: none !important;
    }
  }
</style>
