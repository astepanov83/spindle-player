<!-- A plugin's blocks in Settings, one core view per kind (spec "Settings").
     The blocks sit in the parent's column, so its gap spaces them. -->
<script lang="ts">
  import type { PluginId } from '../../../shared/plugins'
  import { pathEnds } from '../library/scan-text'
  import { actOnSetting } from '../plugins'
  import type { SettingBlock } from '../plugins/types'
  import Icon from '../ui/Icon.svelte'
  import Spinner from '../ui/Spinner.svelte'

  let { plugin, blocks }: { plugin: PluginId; blocks: SettingBlock[] } = $props()

  type Button = Extract<SettingBlock, { kind: 'button' }>
  type Part = Exclude<SettingBlock, Button> | { kind: 'buttons'; buttons: Button[] }

  // buttons that follow each other sit side by side
  const parts = $derived.by(() => {
    const out: Part[] = []
    for (const b of blocks) {
      const last = out[out.length - 1]
      if (b.kind !== 'button') out.push(b)
      else if (last?.kind === 'buttons') last.buttons.push(b)
      else out.push({ kind: 'buttons', buttons: [b] })
    }
    return out
  })

  // The row that is asked to confirm its removal, one at a time.
  let asking: string | null = $state(null)

  const act = (id: string, actionId: string, value?: string): void =>
    actOnSetting(plugin, id, actionId, value)

  function remove(list: string, row: string): void {
    asking = null
    act(list, 'remove', row)
  }
</script>

{#each parts as b, i (i)}
  {#if b.kind === 'title'}
    <span class="section-label">{b.text}</span>
  {:else if b.kind === 'status'}
    <p class="hint status" aria-live="polite">
      {#if b.busy}<Spinner />{/if}
      <span>{b.text}</span>
    </p>
  {:else if b.kind === 'list'}
    {#if b.rows.length}
      <ul>
        {#each b.rows as r (r.id)}
          {@const key = `${b.id}\n${r.id}`}
          <li>
            {#if b.paths}
              {@const [head, tail] = pathEnds(r.title)}
              <!-- cut in the middle: the folder's own name stays -->
              <span class="path" title={r.title}
                ><span class="head">{head}</span><span class="tail">{tail}</span></span
              >
            {:else}
              <span class="path" title={r.title}><span class="head">{r.title}</span></span>
            {/if}
            <!-- while it asks, the title gets the room -->
            {#if r.note && asking !== key}<span class="miss">{r.note}</span>{/if}
            {#if b.remove}
              {#if asking === key && b.confirm}
                <button
                  class="sm pill danger"
                  disabled={b.disabled}
                  onclick={() => remove(b.id, r.id)}>{b.confirm}</button
                >
                <button class="sm pill ghost" onclick={() => (asking = null)}>Cancel</button>
              {:else}
                <button
                  class="rm"
                  aria-label="{b.remove} {r.title}"
                  title={b.remove}
                  disabled={b.disabled}
                  onclick={() => (b.confirm ? (asking = key) : remove(b.id, r.id))}
                  ><Icon name="close" size={16} /></button
                >
              {/if}
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {:else if b.kind === 'buttons'}
    <div class="acts">
      {#each b.buttons as x (x.id)}
        <button class="btn" disabled={x.disabled} onclick={() => act(x.id, 'press')}
          >{x.label}</button
        >
      {/each}
    </div>
  {:else}
    <label class="check">
      <input
        type="checkbox"
        checked={b.on}
        onchange={(e) => act(b.id, 'set', String(e.currentTarget.checked))}
      />
      {b.label}
    </label>
  {/if}
{/each}

<style>
  .hint {
    margin: 0;
    font-size: var(--text-s);
    line-height: 1.45;
    color: var(--ink-2);
  }
  .status {
    display: flex;
    gap: 7px;
    align-items: baseline;
  }
  /* sit on the first line's middle, not its baseline */
  .status :global(.spinner) {
    align-self: flex-start;
    margin-top: 4px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 3px;
    border-radius: 10px;
    background: var(--well);
  }
  li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 4px 4px 10px;
    font-size: var(--text-s);
    min-height: 32px;
  }
  li + li {
    box-shadow: 0 -1px 0 var(--edge);
  }
  .path {
    flex: 1;
    min-width: 0;
    display: flex;
    white-space: nowrap;
  }
  .head {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tail {
    flex: none;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* small pills, to fit the row */
  .sm {
    flex: none;
    padding: 5px 10px;
    font-size: var(--text-s);
  }
  .miss {
    font-size: var(--text-xs);
    color: var(--ink-3);
    flex: none;
  }
  .rm {
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    display: grid;
    place-items: center;
    color: var(--ink-3);
  }
  .rm:hover:not(:disabled) {
    background: var(--hover);
    color: var(--ink);
  }
  .rm:disabled {
    cursor: default;
    opacity: 0.4;
  }
  .acts {
    display: flex;
    gap: 6px;
  }
  .btn {
    font: 500 var(--text-s) var(--ui);
    padding: 7px 12px;
    border-radius: 8px;
    background: var(--field);
    color: var(--ink);
  }
  .btn:hover:not(:disabled) {
    background: var(--active);
  }
  .btn:disabled {
    color: var(--ink-3);
    cursor: default;
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: var(--text-s);
    cursor: pointer;
  }
  .check input {
    margin: 0;
    accent-color: var(--c2);
  }
</style>
