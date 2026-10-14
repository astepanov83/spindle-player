<script lang="ts">
  import { tick } from 'svelte'
  import Icon from '../ui/Icon.svelte'
  import { library } from '../stores/library.svelte'
  import { fieldHelp } from './search-query'

  // onenter: Enter in the box (Radio searches at once). fields: the view
  // takes search by field (ticket 128), so a "?" lists them.
  let {
    placeholder,
    onenter,
    fields = false
  }: { placeholder: string; onenter?: () => void; fields?: boolean } = $props()

  let input: HTMLInputElement | undefined = $state()
  let help: HTMLDivElement | undefined = $state()
  // the help opens under this box, also with a second box on the page
  const uid = $props.id()
  const anchor = `--search-${uid}`

  // Typing keeps the open page: each view shows what it finds over it, and
  // clearing the text shows the page again.
  function oninput(e: Event & { currentTarget: HTMLInputElement }): void {
    library.query = e.currentTarget.value
  }

  // The first Escape clears the text, the next leaves the box.
  function onkeydown(e: KeyboardEvent & { currentTarget: HTMLInputElement }): void {
    if (e.key === 'Enter' && !e.isComposing) return onenter?.()
    if (e.key !== 'Escape') return
    e.preventDefault()
    if (library.query) library.query = ''
    else e.currentTarget.blur()
  }

  function clear(): void {
    library.query = ''
    input?.focus()
  }

  // An example from the help goes into the box, after what is there.
  async function addField(example: string): Promise<void> {
    const q = library.query.trim()
    library.query = q ? `${q} ${example}` : example
    help?.hidePopover()
    // the box shows the new text first, so the caret goes to its end in view
    await tick()
    input?.focus()
    input?.setSelectionRange(library.query.length, library.query.length)
  }
</script>

<label class="search" style:anchor-name={anchor}>
  <Icon name="search" size={18} />
  <input
    type="search"
    {placeholder}
    autocomplete="off"
    data-search
    value={library.query}
    bind:this={input}
    {oninput}
    {onkeydown}
  />
  {#if library.query}
    <button class="clear" aria-label="Clear search" title="Clear search" onclick={clear}
      ><Icon name="close" size={16} /></button
    >
  {/if}
  {#if fields}
    <button
      class="help"
      aria-label="Search by field"
      title="Search by field"
      popovertarget="search-help-{uid}">?</button
    >
  {/if}
</label>
{#if fields}
  <div
    id="search-help-{uid}"
    class="fields"
    popover="auto"
    bind:this={help}
    style:position-anchor={anchor}
  >
    <p class="title">Search by field</p>
    <ul>
      {#each fieldHelp as f (f.example)}
        <li>
          <button title="Add to the search" onclick={() => addField(f.example)}
            ><code>{f.example}</code></button
          >
          <span>{f.text}</span>
        </li>
      {/each}
    </ul>
    <p class="note">
      Mix them with words: all must match. A field name typed wrong is searched as words.
    </p>
  </div>
{/if}

<style>
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--field);
    border-radius: 8px;
    padding: 0 12px;
    color: var(--ink-3);
  }
  input {
    flex: 1;
    min-width: 0;
    height: 38px;
    background: none;
    border: 0;
    color: var(--ink);
    font: var(--text-m) var(--ui);
    outline: none;
    box-shadow: none;
  }
  /* our own clear button takes its place */
  input::-webkit-search-cancel-button {
    display: none;
  }
  .clear {
    width: 24px;
    height: 24px;
    margin-right: -6px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--ink-3);
  }
  .clear:hover,
  .help:hover {
    background: var(--hover);
    color: var(--ink);
  }
  .help {
    width: 22px;
    height: 22px;
    margin-right: -6px;
    flex: none;
    border-radius: 50%;
    border: 1.5px solid currentColor;
    color: var(--ink-3);
    font: 600 var(--text-s) var(--ui);
    line-height: 1;
  }
  .fields {
    inset: auto;
    top: anchor(bottom);
    left: anchor(left);
    position-try-fallbacks: flip-inline, flip-block;
    margin: 6px 0;
    width: min(380px, calc(100vw - 32px));
    max-height: calc(100vh - 16px);
    overflow: auto;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--panel);
    color: var(--ink);
    border: 1px solid var(--edge);
    box-shadow: 0 14px 40px var(--shadow);
    font-size: var(--text-m);
  }
  .fields .title {
    margin: 0 0 6px;
    font-weight: 600;
  }
  .fields ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .fields li {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .fields li button {
    flex: none;
    width: 150px;
    white-space: nowrap;
    text-align: left;
    padding: 4px 6px;
    margin-left: -6px;
    border-radius: 6px;
  }
  .fields li button:hover,
  .fields li button:focus-visible {
    background: color-mix(in srgb, var(--ink) 13%, transparent);
    outline: none;
    box-shadow: none;
  }
  .fields code {
    font: var(--text-s) var(--mono);
  }
  .fields li span {
    color: var(--ink-2);
    font-size: var(--text-s);
  }
  .fields .note {
    margin: 8px 0 0;
    color: var(--ink-3);
    font-size: var(--text-s);
  }
  input::placeholder {
    color: var(--ink-3);
  }
  .search:focus-within {
    box-shadow: var(--focus-bands);
  }
</style>
