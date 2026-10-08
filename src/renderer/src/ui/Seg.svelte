<!-- Segmented buttons: one of a few choices, a radio group for the keyboard.
     One Tab stop; the arrows pick the next choice. A choice with an icon
     shows only the icon, its label as the tooltip. -->
<script lang="ts" generics="T extends string">
  import { radioStep } from '../keys'
  import Icon from './Icon.svelte'
  import type { IconName } from './icons'

  let {
    options,
    value,
    label,
    onchange,
    small = false
  }: {
    options: { value: T; label: string; icon?: IconName }[]
    value: T
    label: string
    onchange: (v: T) => void
    // in a list's head: as wide as its words, and lower
    small?: boolean
  } = $props()

  const picked = $derived(
    Math.max(
      0,
      options.findIndex((o) => o.value === value)
    )
  )

  function onkeydown(e: KeyboardEvent & { currentTarget: HTMLElement }, i: number): void {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    const to = radioStep(e.key, i, options.length)
    if (to === null) return
    e.preventDefault()
    ;(e.currentTarget.parentElement?.children[to] as HTMLElement | undefined)?.focus()
    onchange(options[to].value)
  }
</script>

<div class="seg" class:small role="radiogroup" aria-label={label}>
  {#each options as o, i (o.value)}
    <button
      role="radio"
      aria-checked={o.value === value}
      tabindex={i === picked ? 0 : -1}
      onclick={() => onchange(o.value)}
      class:icon={!!o.icon}
      aria-label={o.icon ? o.label : undefined}
      title={o.icon ? o.label : undefined}
      onkeydown={(e) => onkeydown(e, i)}
      >{#if o.icon}<Icon name={o.icon} size={16} />{:else}{o.label}{/if}</button
    >
  {/each}
</div>

<style>
  .seg {
    display: flex;
    gap: 3px;
    background: var(--well);
    padding: 3px;
    border-radius: 10px;
  }
  button {
    flex: 1;
    font: 500 var(--text-s) var(--ui);
    color: var(--ink-2);
    padding: 7px 8px;
    border-radius: 8px;
    transition:
      background 0.15s,
      color 0.15s;
  }
  .small {
    padding: 2px;
    border-radius: 8px;
  }
  .small button {
    flex: none;
    font-size: var(--text-xs);
    padding: 4px 10px;
    border-radius: 6px;
    white-space: nowrap;
  }
  .small button.icon {
    padding: 3px 6px;
  }
  button:hover {
    background: var(--hover);
    color: var(--ink);
  }
  /* filled, so the pick is plain in both themes (a raised grey was not, in dark) */
  button[aria-checked='true'] {
    background: var(--ink);
    color: var(--bg);
  }
</style>
