<script lang="ts">
  import Icon from '../ui/Icon.svelte'
  import { library } from '../stores/library.svelte'

  let { placeholder }: { placeholder: string } = $props()

  function oninput(e: Event & { currentTarget: HTMLInputElement }): void {
    library.query = e.currentTarget.value
    library.open = null
    // search results show as songs in the sidebar; Folders searches the open folder
    const s = library.section
    if (s.startsWith('pl:') || s === 'artists') library.section = 'songs'
  }
</script>

<label class="search">
  <Icon name="search" size={18} />
  <input type="search" {placeholder} autocomplete="off" value={library.query} {oninput} />
</label>

<style>
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--field);
    border-radius: 9px;
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
    font: 14px var(--ui);
    outline: none;
  }
  input::placeholder {
    color: var(--ink-3);
  }
  .search:focus-within {
    box-shadow: 0 0 0 2px var(--ring);
  }
</style>
