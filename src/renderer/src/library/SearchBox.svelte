<script lang="ts">
  import Icon from '../ui/Icon.svelte'
  import { library } from '../stores/library.svelte'

  // onenter: Enter in the box (Radio searches at once)
  let { placeholder, onenter }: { placeholder: string; onenter?: () => void } = $props()

  let input: HTMLInputElement | undefined = $state()

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
</script>

<label class="search">
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
</label>

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
  .clear:hover {
    background: var(--hover);
    color: var(--ink);
  }
  input::placeholder {
    color: var(--ink-3);
  }
  .search:focus-within {
    box-shadow: var(--focus-bands);
  }
</style>
