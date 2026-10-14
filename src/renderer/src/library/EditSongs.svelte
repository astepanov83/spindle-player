<!-- The edit form for songs' info (ticket 129): a dialog over the page with
     the fields the songs' plugin gives. Enter saves, Escape or Cancel close
     it. A field is saved only when its text changed or it was put back to
     the file's own value. -->
<script lang="ts">
  import { editSongs } from './edit-songs.svelte'
  import type { EditField } from '../plugins/types'

  let el: HTMLDialogElement | undefined = $state()
  let formEl: HTMLFormElement | undefined = $state()
  // by field id: the text in the box, and whether it was put back to the file's value
  let texts: Record<string, string> = $state({})
  let resets: Record<string, boolean> = $state({})

  const form = $derived(editSongs.form)
  const uid = $props.id()

  $effect(() => {
    if (!el) return
    if (form && !el.open) {
      texts = Object.fromEntries(form.fields.map((f) => [f.id, f.value]))
      resets = {}
      el.showModal()
      formEl?.querySelector('input')?.focus()
    } else if (!form && el.open) el.close()
  })

  function bad(f: EditField): string | undefined {
    const t = (texts[f.id] ?? '').trim()
    if (f.max === undefined || !t) return undefined
    return /^\d+$/.test(t) && Number(t) <= f.max ? undefined : `A number up to ${f.max}`
  }

  const invalid = $derived(form?.fields.some((f) => bad(f)) ?? false)

  function typed(f: EditField, text: string): void {
    texts[f.id] = text
    resets[f.id] = false
  }

  function useFile(f: EditField): void {
    if (!f.file) return
    texts[f.id] = f.file.text
    resets[f.id] = true
  }

  function save(e: SubmitEvent): void {
    e.preventDefault()
    if (!form || invalid) return
    const changes: Record<string, string | null> = {}
    for (const f of form.fields) {
      if (resets[f.id]) changes[f.id] = null
      else if (texts[f.id] !== f.value) changes[f.id] = texts[f.id]
    }
    const run = form.save
    el?.close()
    if (Object.keys(changes).length) run(changes)
  }

  // a click on the dim area around the box is Cancel
  function onclick(e: MouseEvent): void {
    if (e.target === el) el?.close()
  }
</script>

<!-- Keys stay in the box: Space types here, and Escape (the dialog's own
     cancel) must not also close Settings behind it. -->
<dialog
  bind:this={el}
  aria-labelledby="{uid}-title"
  {onclick}
  onclose={() => editSongs.close()}
  onkeydown={(e) => e.stopPropagation()}
>
  {#if form}
    <form class="box" bind:this={formEl} onsubmit={save} novalidate>
      <header>
        <h3 id="{uid}-title">{form.title}</h3>
        {#if form.sub}<p class="sub" title={form.sub}>{form.sub}</p>{/if}
      </header>
      <div class="fields">
        {#each form.fields as f (f.id)}
          {@const error = bad(f)}
          <div class="field" class:wide={f.wide}>
            <label for="{uid}-{f.id}">{f.label}</label>
            <input
              id="{uid}-{f.id}"
              type="text"
              autocomplete="off"
              spellcheck="false"
              inputmode={f.max !== undefined ? 'numeric' : undefined}
              maxlength={f.max !== undefined ? 6 : 1000}
              placeholder={f.placeholder}
              value={texts[f.id] ?? ''}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={f.hint || f.file || error ? `${uid}-${f.id}-more` : undefined}
              oninput={(e) => typed(f, e.currentTarget.value)}
            />
            {#if f.hint || f.file || error}
              <p class="more" id="{uid}-{f.id}-more">
                {#if error}<span class="error">{error}</span>
                {:else if f.file}
                  {#if resets[f.id]}<span>The file's value</span>
                  {:else}
                    <span>{f.file.label}</span>
                    <button type="button" class="chip use" onclick={() => useFile(f)}>Use it</button
                    >
                  {/if}
                {:else}<span>{f.hint}</span>{/if}
              </p>
            {/if}
          </div>
        {/each}
      </div>
      {#if form.note}<p class="note">{form.note}</p>{/if}
      <div class="acts">
        <button class="pill" type="submit" disabled={invalid}>Save</button>
        <button class="pill ghost" type="button" onclick={() => el?.close()}>Cancel</button>
      </div>
    </form>
  {/if}
</dialog>

<style>
  dialog {
    padding: 0;
    border: none;
    border-radius: 14px;
    color: var(--ink);
    background: var(--panel);
    box-shadow:
      0 20px 50px var(--shadow),
      0 0 0 1px var(--edge);
    width: min(520px, calc(100% - 24px));
    max-height: calc(100% - 48px);
  }
  dialog[open] {
    animation: fadeup 0.2s;
  }
  dialog::backdrop {
    background: var(--glass);
  }
  @keyframes fadeup {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
  @keyframes fadein {
    from {
      opacity: 0;
    }
  }
  /* a fade, not a movement */
  @media (prefers-reduced-motion: reduce) {
    dialog[open] {
      animation-name: fadein;
    }
  }
  .box {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px 18px 16px;
  }
  header {
    min-width: 0;
  }
  h3 {
    margin: 0;
    font-size: var(--title-s);
  }
  .sub {
    margin: 2px 0 0;
    font-size: var(--text-s);
    color: var(--ink-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fields {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 10px 12px;
  }
  /* two to a row, or a row of their own; the three numbers share one */
  .field {
    grid-column: span 3;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .field.wide {
    grid-column: 1 / -1;
  }
  .field:has(input[inputmode='numeric']) {
    grid-column: span 2;
  }
  @media (max-width: 420px) {
    .field,
    .field:has(input[inputmode='numeric']) {
      grid-column: 1 / -1;
    }
  }
  label {
    font-size: var(--text-xs);
    color: var(--ink-2);
  }
  /* as Settings' text boxes */
  input {
    width: 100%;
    box-sizing: border-box;
    height: 34px;
    padding: 0 10px;
    border: 0;
    border-radius: 8px;
    background: var(--field);
    color: var(--ink);
    font: var(--text-s) var(--ui);
  }
  input::placeholder {
    color: var(--ink-3);
  }
  input[aria-invalid='true'] {
    box-shadow: inset 0 0 0 1px var(--danger);
  }
  .more {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: baseline;
    margin: 0;
    font-size: var(--text-xs);
    color: var(--ink-3);
    overflow-wrap: anywhere;
  }
  .error {
    color: var(--danger);
  }
  .chip.use {
    padding: 2px 9px;
    font-size: var(--text-xs);
  }
  .note {
    margin: 0;
    font-size: var(--text-s);
    color: var(--ink-2);
  }
  .acts {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
</style>
