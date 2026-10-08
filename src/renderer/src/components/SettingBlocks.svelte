<!-- A plugin's blocks in Settings, one core view per kind (spec "Settings").
     The blocks sit in the parent's column, so its gap spaces them. An `ai`
     block is a box with its own blocks drawn by this same view. -->
<script lang="ts">
  import { tick } from 'svelte'
  import type { PluginId } from '../../../shared/plugins'
  import { folderParts } from '../ui/path-ends'
  import { actOnSetting } from '../plugins'
  import { ai, actOnAi } from '../ai.svelte'
  import { aiBlocks, aiTarget } from '../ai-blocks'
  import type { SettingBlock } from '../../../shared/setting-blocks'
  import { optionText, shownText, textToSend, type Draft } from './setting-input'
  import Icon from '../ui/Icon.svelte'
  import Spinner from '../ui/Spinner.svelte'
  import Switch from '../ui/Switch.svelte'
  import Seg from '../ui/Seg.svelte'
  import SettingBlocks from './SettingBlocks.svelte'

  // ties each label to its box, with more than one of these on the page
  const uid = $props.id()
  let { plugin, blocks }: { plugin: PluginId; blocks: SettingBlock[] } = $props()

  type Button = Extract<SettingBlock, { kind: 'button' }>
  type Status = Extract<SettingBlock, { kind: 'status' }>
  type Part =
    | Exclude<SettingBlock, Button | Status | { kind: 'ai' }>
    | { kind: 'ai'; blocks: SettingBlock[] }
    | { kind: 'buttons'; buttons: Button[] }
    | { kind: 'statuses'; lines: Status[] }

  // Buttons that follow each other sit side by side, and status lines share
  // one live region. It is there with no lines too (at the end), so a screen
  // reader hears the first line that comes.
  const parts = $derived.by(() => {
    const out: Part[] = []
    for (const b of blocks) {
      const last = out[out.length - 1]
      // an `ai` block becomes its switch and setup, then the plugin's own blocks
      // for the task; none before the AI service said what it has
      if (b.kind === 'ai') {
        const setup = aiBlocks(b.task, ai.state)
        if (setup.length) out.push({ kind: 'ai', blocks: [...setup, ...(b.blocks ?? [])] })
      } else if (b.kind === 'button')
        if (last?.kind === 'buttons') last.buttons.push(b)
        else out.push({ kind: 'buttons', buttons: [b] })
      else if (b.kind === 'status')
        if (last?.kind === 'statuses') last.lines.push(b)
        else out.push({ kind: 'statuses', lines: [b] })
      else out.push(b)
    }
    if (!out.some((p) => p.kind === 'statuses')) out.push({ kind: 'statuses', lines: [] })
    return out
  })

  // by kind and count, so the live region stays while its lines change
  const keys = $derived.by(() => {
    const seen: Record<string, number> = {}
    return parts.map((p) => `${p.kind} ${(seen[p.kind] = (seen[p.kind] ?? -1) + 1)}`)
  })

  // The row that is asked to confirm its removal, or the button asked to
  // confirm its press, one at a time.
  let asking: string | null = $state(null)

  // the AI blocks' ids say so; they go to the AI service, not to the plugin
  const act = (id: string, actionId: string, value?: string): void =>
    aiTarget(id) ? actOnAi(id, actionId, value) : actOnSetting(plugin, id, actionId, value)

  // What is typed in a text box and not sent yet, by block id, and what was
  // sent last (so Enter and then blur send once). Secrets are kept apart: the
  // page drops one as soon as it is sent. `changing`: the secret boxes that
  // are open again after "Change".
  let drafts: Record<string, Draft> = $state({})
  let sent: Record<string, Draft> = {}
  let secrets: Record<string, string> = $state({})
  let changing: Record<string, boolean> = $state({})

  function send(id: string, value: string): void {
    const text = textToSend(drafts[id], value, sent[id])
    if (text === undefined) return
    sent[id] = { text, base: value }
    act(id, 'set', text)
  }

  function sendSecret(id: string): void {
    const text = secrets[id]
    if (!text) return
    delete secrets[id]
    changing[id] = false
    act(id, 'set', text)
  }

  // a list's row key has its list id first, so this can't be one
  const buttonKey = (id: string): string => `\n${id}`

  function focusNow(node: HTMLElement): void {
    node.focus()
  }

  // back to the button once it is drawn again
  async function stopAsking(id: string): Promise<void> {
    asking = null
    await tick()
    document.getElementById(`${uid}-${id}-btn`)?.focus()
  }

  // Escape cancels the question and must not close Settings too
  function askKey(e: KeyboardEvent, id: string): void {
    if (e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    void stopAsking(id)
  }

  function goOn(id: string): void {
    act(id, 'press')
    void stopAsking(id)
  }

  function remove(list: string, row: string): void {
    asking = null
    act(list, 'remove', row)
  }
</script>

{#each parts as b, i (keys[i])}
  {#if b.kind === 'ai'}
    <div class="aibox">
      <SettingBlocks {plugin} blocks={b.blocks} />
    </div>
  {:else if b.kind === 'title'}
    <span class="section-label">{b.text}</span>
  {:else if b.kind === 'statuses'}
    <div class="lines" aria-live="polite">
      {#each b.lines as line, j (j)}
        <p class="hint status" class:error={line.error}>
          {#if line.busy}<Spinner />{/if}
          <span>{line.text}</span>
        </p>
      {/each}
    </div>
  {:else if b.kind === 'list'}
    {#if b.rows.length}
      <ul>
        {#each b.rows as r (r.id)}
          {@const key = `${b.id}\n${r.id}`}
          <li>
            {#if b.paths}
              {@const { name, dir } = folderParts(r.title)}
              <!-- the folder's own name first; where it is, faint, is cut first -->
              <span class="path" title={r.title}
                ><span class="name">{name}</span>{#if dir}<span class="dir">{dir}</span>{/if}</span
              >
            {:else}
              <span class="path" title={r.title}><span class="name">{r.title}</span></span>
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
        {#if asking === buttonKey(x.id) && x.confirm && !x.disabled}
          <div class="ask" role="group" aria-labelledby="{uid}-{x.id}-ask">
            <p class="hint" id="{uid}-{x.id}-ask">{x.confirm}</p>
            <button class="sm pill" onkeydown={(e) => askKey(e, x.id)} onclick={() => goOn(x.id)}
              >Go on</button
            >
            <!-- focus starts on Cancel, so a second Enter can't run it unread -->
            <button
              class="sm pill ghost"
              use:focusNow
              onkeydown={(e) => askKey(e, x.id)}
              onclick={() => stopAsking(x.id)}>Cancel</button
            >
          </div>
        {:else}
          <button
            class="btn"
            id="{uid}-{x.id}-btn"
            disabled={x.disabled}
            onclick={() => (x.confirm ? (asking = buttonKey(x.id)) : act(x.id, 'press'))}
            >{x.label}</button
          >
        {/if}
      {/each}
    </div>
  {:else if b.kind === 'text'}
    {@const box = `${uid}-${b.id}`}
    <div class="field">
      {#if b.secret && b.saved && !changing[b.id]}
        <span class="label">{b.label}</span>
        <div class="saved">
          <span class="state">Saved</span>
          <button class="sm pill ghost" disabled={b.disabled} onclick={() => act(b.id, 'remove')}
            >Remove</button
          >
          <button
            class="sm pill ghost"
            disabled={b.disabled}
            onclick={() => (changing[b.id] = true)}>Change</button
          >
        </div>
      {:else}
        <label class="label" for={box}>{b.label}</label>
        <input
          id={box}
          class="box"
          type={b.secret ? 'password' : 'text'}
          autocomplete="off"
          spellcheck="false"
          placeholder={b.placeholder}
          disabled={b.disabled}
          value={b.secret ? (secrets[b.id] ?? '') : shownText(drafts[b.id], b.value ?? '')}
          oninput={(e) => {
            const text = e.currentTarget.value
            if (b.secret) secrets[b.id] = text
            else drafts[b.id] = { text, base: b.value ?? '' }
          }}
          onkeydown={(e) => {
            if (e.key !== 'Enter') return
            if (b.secret) sendSecret(b.id)
            else send(b.id, b.value ?? '')
          }}
          onblur={() => (b.secret ? sendSecret(b.id) : send(b.id, b.value ?? ''))}
        />
      {/if}
    </div>
  {:else if b.kind === 'choice' && b.segments}
    <div class="field">
      <span class="label">{b.label}</span>
      <Seg
        label={b.label}
        options={b.options.map((o) => ({ value: o.id, label: o.label }))}
        value={b.value}
        onchange={(v) => act(b.id, 'set', v)}
      />
      {#if b.about}<p class="hint">{b.about}</p>{/if}
    </div>
  {:else if b.kind === 'choice'}
    {@const box = `${uid}-${b.id}`}
    <div class="field">
      <label class="label" for={box}>{b.label}</label>
      <select
        id={box}
        class="box"
        disabled={b.disabled}
        value={b.value}
        onchange={(e) => act(b.id, 'set', e.currentTarget.value)}
      >
        {#each b.options as o (o.id)}
          <option value={o.id} selected={o.id === b.value}>{optionText(o)}</option>
        {/each}
      </select>
    </div>
  {:else if b.kind === 'switch'}
    <div class="field">
      <Switch
        label={b.label}
        on={b.on}
        describedby={b.about ? `${uid}-${b.id}-about` : undefined}
        onchange={(on) => act(b.id, 'set', String(on))}
      />
      {#if b.about}<p class="hint" id="{uid}-{b.id}-about">{b.about}</p>{/if}
    </div>
  {/if}
{/each}

<style>
  .hint {
    margin: 0;
    font-size: var(--text-s);
    line-height: 1.45;
    color: var(--ink-2);
  }
  /* an empty region takes no gap in the parent's column */
  .lines:empty {
    position: absolute;
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
    gap: 8px;
    align-items: baseline;
    white-space: nowrap;
  }
  .name {
    flex: none;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dir {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: var(--text-xs);
    color: var(--ink-3);
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
    flex-wrap: wrap;
    gap: 6px;
  }
  /* the question takes the row, its buttons go under it when narrow */
  .ask {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
  }
  .ask .hint {
    flex: 1 1 100%;
    color: var(--ink);
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
  .status.error {
    color: var(--warn);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .label {
    font-size: var(--text-s);
    color: var(--ink-2);
  }
  .box {
    height: 34px;
    padding: 0 10px;
    border: 0;
    border-radius: 8px;
    background: var(--field);
    color: var(--ink);
    font: var(--text-s) var(--ui);
  }
  select.box {
    cursor: pointer;
  }
  .box:disabled {
    color: var(--ink-3);
    cursor: default;
  }
  .box::placeholder {
    color: var(--ink-3);
  }
  .saved {
    display: flex;
    gap: 6px;
    align-items: center;
    min-height: 34px;
  }
  .state {
    flex: 1;
    font-size: var(--text-s);
    color: var(--ink);
  }
  /* the task reads as a part of the plugin, with its own blocks inside */
  .aibox {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px 14px;
    border-radius: 12px;
    box-shadow: inset 0 0 0 1px var(--edge);
    background: var(--hover);
  }
</style>
