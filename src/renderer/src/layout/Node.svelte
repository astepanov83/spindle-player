<!-- Renders one node of the built layout: a box, a part, or tabs. Calls itself for children. -->
<script lang="ts">
  import Node from './Node.svelte'
  import Drawer from './Drawer.svelte'
  import Controls from '../parts/Controls.svelte'
  import Library from '../parts/Library.svelte'
  import NowPlaying from '../parts/NowPlaying.svelte'
  import Queue from '../parts/Queue.svelte'
  import { layout } from '../stores/layout.svelte'
  import type { BuiltNode } from './build'

  let { node }: { node: BuiltNode } = $props()
</script>

{#snippet drawer()}
  {#if node.drawer}<Drawer />{/if}
{/snippet}

{#if node.kind === 'box'}
  <div
    class="box {node.dir}"
    class:look-tint={node.look === 'tint'}
    class:look-ambient={node.look === 'ambient'}
    class:dhost={node.drawer}
    style:flex={node.flex}
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
  <div class="tabsbox" class:dhost={node.drawer} style:flex={node.flex}>
    <div class="tabstrip">
      {#each node.labels as label, i (i)}
        <button aria-pressed={layout.tabSel === i} onclick={() => (layout.tabSel = i)}
          >{label}</button
        >
      {/each}
    </div>
    {#each node.panes as pane, i (i)}
      <div class="tabpane" hidden={layout.tabSel !== i}><Node node={pane} /></div>
    {/each}
    {@render drawer()}
  </div>
{:else}
  {@const p = node.part}
  <div
    class="part"
    class:part-queue={p.part === 'queue'}
    class:dhost={node.drawer}
    style:flex={node.flex}
  >
    {#if p.part === 'library'}
      <Library nav={p.opts.nav} />
    {:else if p.part === 'nowplaying'}
      <NowPlaying style={p.opts.style} />
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
  .row {
    flex-direction: row;
  }
  .col {
    flex-direction: column;
  }
  /* lines between parts */
  .row > :global(* + *) {
    border-left: 1px solid var(--edge);
  }
  .col > :global(* + *) {
    border-top: 1px solid var(--edge);
  }
  .look-tint > :global(*),
  .look-ambient > :global(*) {
    border: 0 !important;
  }
  .part {
    position: relative;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .row > :global(.part-queue) {
    background: var(--bg-side);
  }
  .dhost {
    position: relative;
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
    margin: 14px 20px 4px;
    background: var(--well);
    border-radius: 10px;
    padding: 3px;
    flex: none;
  }
  .tabstrip button {
    flex: 1;
    font-size: 13px;
    font-weight: 500;
    padding: 7px 0;
    border-radius: 8px;
    color: var(--ink-2);
    text-align: center;
  }
  .tabstrip button[aria-pressed='true'] {
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
