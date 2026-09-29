<!-- The context menu from the menu store. Closes on a click outside, Escape, scroll or blur. -->
<script lang="ts">
  import { tick } from 'svelte'
  import { menu, type MenuItem } from '../stores/menu.svelte'

  let el: HTMLDivElement | undefined = $state()
  let pos = $state({ x: 0, y: 0 })

  // keep it inside the window
  $effect(() => {
    const m = menu.open
    if (!m) return
    pos = { x: m.x, y: m.y }
    tick().then(() => {
      if (!el) return
      const r = el.getBoundingClientRect()
      pos = {
        x: Math.max(4, Math.min(m.x, innerWidth - r.width - 4)),
        y: Math.max(4, Math.min(m.y, innerHeight - r.height - 4))
      }
      el.querySelector('button')?.focus()
    })
  })

  function pick(item: MenuItem): void {
    menu.close()
    item.run()
  }

  function onpointerdown(e: PointerEvent): void {
    if (menu.open && el && !el.contains(e.target as Node)) menu.close()
  }

  function onkeydown(e: KeyboardEvent): void {
    if (!menu.open || !el) return
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...el.querySelectorAll('button')]
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.key === 'ArrowDown' ? i + 1 : i - 1
    items[(next + items.length) % items.length]?.focus()
  }
</script>

<svelte:window
  onpointerdowncapture={onpointerdown}
  {onkeydown}
  onblur={() => menu.close()}
  onresize={() => menu.close()}
  onwheelcapture={(e) => {
    if (el && !el.contains(e.target as Node)) menu.close()
  }}
/>

{#if menu.open}
  <div class="menu" role="menu" bind:this={el} style:left="{pos.x}px" style:top="{pos.y}px">
    {#each menu.open.entries as entry, i (i)}
      {#if entry === 'line'}
        <hr />
      {:else if 'heading' in entry}
        <div class="head">{entry.heading}</div>
      {:else}
        <button
          role={entry.checked === undefined ? 'menuitem' : 'menuitemradio'}
          aria-checked={entry.checked}
          class:indent={entry.indent}
          class:checked={entry.checked}
          onclick={() => pick(entry)}>{entry.label}</button
        >
      {/if}
    {/each}
  </div>
{/if}

<style>
  .menu {
    position: fixed;
    z-index: 40;
    min-width: 200px;
    max-width: 320px;
    max-height: calc(100vh - 8px);
    overflow: auto;
    padding: 6px;
    border-radius: 10px;
    background: var(--panel);
    border: 1px solid var(--edge);
    box-shadow: 0 14px 40px var(--shadow);
    font-size: 14px;
  }
  .head {
    padding: 6px 10px 4px;
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-3);
    font-weight: 600;
  }
  button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    border-radius: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  button.indent {
    padding-left: 18px;
  }
  button.checked {
    font-weight: 600;
  }
  button.checked::after {
    content: '✓';
    float: right;
    margin-left: 12px;
  }
  button:hover,
  button:focus-visible {
    background: var(--hover);
    outline: none;
  }
  hr {
    border: 0;
    border-top: 1px solid var(--edge);
    margin: 6px 4px;
  }
</style>
