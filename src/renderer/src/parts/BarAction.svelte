<!-- One of the item's actions on the player bar, drawn in the core's style: a
     button, or a choice that opens the app's menu with the picked option checked.
     `wide`: the bar has room for a button's word and wants a choice short
     ("320"); the stack shows a button's icon alone and a choice whole. -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte'
  import { menu } from '../stores/menu.svelte'
  import { queues } from '../stores/queues.svelte'
  import type { Action } from '../plugins/types'
  import { choiceView } from '../queue/bar'

  let { action, wide }: { action: Action; wide: boolean } = $props()

  const view = $derived(action.kind === 'choice' ? choiceView(action, wide) : undefined)
  const iconOnly = $derived(action.kind === 'button' && !wide && !!action.icon)

  function open(e: MouseEvent): void {
    if (action.kind !== 'choice') return
    const a = action
    menu.showFor(e, [
      { heading: a.label },
      ...a.options.map((o) => ({
        label: o.label,
        checked: o.id === a.picked,
        run: () => queues.act(a.id, o.id)
      }))
    ])
  }
</script>

{#if action.kind === 'button'}
  <button
    class="act chip"
    class:icon={iconOnly}
    title={action.hint}
    aria-label={iconOnly ? (action.hint ?? action.label) : undefined}
    aria-pressed={action.on}
    aria-busy={action.busy || undefined}
    onclick={() => queues.act(action.id)}
    >{#if action.icon}<Icon
        name={action.icon}
        size={16}
      />{/if}{#if !iconOnly}{action.label}{/if}</button
  >
{:else if view?.kind === 'menu'}
  <button
    class="pick chip"
    aria-haspopup="menu"
    aria-label="{action.label}: {view.picked ?? 'none'}"
    title={view.picked}
    onclick={open}>{view.text}<span class="arrow">▾</span></button
  >
{:else if view}
  <!-- one option: nothing to pick, so there is room to say what it is -->
  <span class="pick one">{view.text}</span>
{/if}

<style>
  .act {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px 5px 9px;
    color: var(--ink);
    font-weight: 600;
    flex: none;
  }
  .act.icon {
    padding: 5px;
  }
  .pick {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    flex: none;
  }
  .one {
    background: none;
    padding: 4px 0;
  }
  .arrow {
    font-size: 10px;
  }
</style>
