<!-- One of the item's actions on the player bar, drawn in the core's style: a
     button, or a choice that opens the app's menu with the picked option checked.
     `wide`: the bar has room for a button's word and wants a choice short
     ("320k"); the stack shows a button's icon alone and a choice whole. A
     plain button (the heart) is its icon alone everywhere, with its few
     letters after it (the sleep timer's "23m") unless `bare` (Mini). -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte'
  import { menu } from '../stores/menu.svelte'
  import { queues } from '../stores/queues.svelte'
  import type { Action } from '../plugins/types'
  import { choiceView, sleepId } from '../queue/bar'
  import { openSleepMenu } from './sleep-menu'

  let { action, wide, bare = false }: { action: Action; wide: boolean; bare?: boolean } = $props()

  const view = $derived(action.kind === 'choice' ? choiceView(action, wide) : undefined)
  const iconOnly = $derived(action.kind === 'button' && !wide && !!action.icon)

  // the moon opens the core's sleep timer menu; any other button acts
  function press(e: MouseEvent): void {
    if (action.id === sleepId) void openSleepMenu(e)
    else queues.act(action.id)
  }

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

{#if action.kind === 'button' && action.plain && action.icon}
  {@const text = bare ? undefined : action.text}
  <button
    class="plain"
    class:on={action.on}
    class:text
    title={action.hint}
    aria-label={action.id === sleepId ? action.hint : action.label}
    aria-haspopup={action.id === sleepId ? 'menu' : undefined}
    aria-pressed={action.id === sleepId ? undefined : action.on}
    aria-busy={action.busy || undefined}
    data-keep={(action.id === sleepId && action.on) || undefined}
    onclick={press}
    ><Icon name={action.icon} />{#if text}<span>{text}</span>{/if}</button
  >
{:else if action.kind === 'button'}
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
  /* as the bar's other round buttons (ui/IconButton.svelte) */
  .plain {
    width: var(--icobtn, 38px);
    height: var(--icobtn, 38px);
    display: grid;
    place-items: center;
    flex: none;
    border-radius: 50%;
    opacity: 0.8;
    transition:
      opacity 0.15s,
      background 0.15s,
      transform 0.1s;
  }
  /* the sleep timer's time left after its moon */
  .plain.text {
    width: auto;
    gap: 4px;
    display: inline-flex;
    padding: 0 10px 0 7px;
    border-radius: 999px;
    font-size: var(--text-xs);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .plain:hover {
    opacity: 1;
    background: var(--active);
  }
  .plain:active {
    transform: scale(0.92);
  }
  /* on in the album accent, fitted to 3:1 like Shuffle's; the filled icon
     says it too */
  .plain.on {
    opacity: 1;
    color: var(--c2);
  }
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
