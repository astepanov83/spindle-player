<!-- The song info panel (ticket 127): a dialog over the page with what the
     song's plugin says about it, in sections. Escape, a click outside or
     Close shut it; keys stay inside while it is open. -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte'
  import Spinner from '../ui/Spinner.svelte'
  import { layout } from '../stores/layout.svelte'
  import { songInfo } from './song-info.svelte'
  import { untrack } from 'svelte'
  import { SvelteSet } from 'svelte/reactivity'
  import type { InfoButton } from '../plugins/types'

  let el: HTMLDialogElement | undefined = $state()
  let body: HTMLDivElement | undefined = $state()
  // long values shown whole, by section and row
  const opened = new SvelteSet<string>()
  // a button's answer for a moment ("Copied"), by its place
  let said: { at: string; text: string } | null = $state(null)
  let saidTimer: ReturnType<typeof setTimeout> | undefined

  const view = $derived(songInfo.view)

  $effect(() => {
    if (!el) return
    if (view && !el.open) {
      untrack(() => opened.clear())
      said = null
      el.showModal()
      // the scroll box, so the arrows and Page Down read it at once
      body?.focus()
      body?.scrollTo(0, 0)
    } else if (!view && el.open) el.close()
  })

  // a click on the dim area around the box closes it
  function onclick(e: MouseEvent): void {
    if (e.target === el) el?.close()
  }

  function toggle(at: string): void {
    if (!opened.delete(at)) opened.add(at)
  }

  async function press(b: InfoButton, at: string): Promise<void> {
    const text = await b.run()
    if (!text) return
    clearTimeout(saidTimer)
    said = { at, text }
    saidTimer = setTimeout(() => (said = null), 2500)
  }
</script>

<!-- Keys stay in the box: Space must not play or pause behind it, and
     Escape (the dialog's own cancel) must not also close Settings. -->
<dialog
  bind:this={el}
  class:bar={layout.bar}
  aria-labelledby="song-info-title"
  {onclick}
  onclose={() => songInfo.close()}
  onkeydown={(e) => e.stopPropagation()}
>
  {#if view}
    <div class="box">
      <header>
        <div class="names">
          <h3 id="song-info-title" title={view.title}>{view.title}</h3>
          {#if view.sub}<p class="sub" title={view.sub}>{view.sub}</p>{/if}
        </div>
        {#if songInfo.reading}<Spinner />{/if}
        <button class="close" aria-label="Close" title="Close (Esc)" onclick={() => el?.close()}
          ><Icon name="close" size={16} /></button
        >
      </header>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="body" bind:this={body} tabindex="0" aria-label="Song info">
        {#each view.sections as s, si (s.title)}
          <section aria-labelledby="song-info-s{si}">
            <h4 id="song-info-s{si}">{s.title}</h4>
            {#if s.note}<p class="note">{s.note}</p>{/if}
            {#if s.rows.length}
              <dl>
                {#each s.rows as r, ri (ri)}
                  {#if 'heading' in r}
                    <div class="tagtype">{r.heading}</div>
                  {:else}
                    {@const at = `${si}/${ri}`}
                    {@const whole = opened.has(at)}
                    <dt>{r.label}</dt>
                    <dd>
                      <span class="v" class:path={r.path} class:cut={r.long && !whole}
                        >{r.value}</span
                      >
                      {#if r.long || r.buttons}
                        <span class="acts">
                          {#if r.long}
                            <button class="chip small" onclick={() => toggle(at)}
                              >{whole ? 'Show less' : 'Show all'}</button
                            >
                          {/if}
                          {#each r.buttons ?? [] as b, bi (bi)}
                            <button class="chip small" onclick={() => press(b, at)}
                              >{b.label}</button
                            >
                          {/each}
                          {#if said?.at === at}<span class="said" role="status">{said.text}</span
                            >{/if}
                        </span>
                      {/if}
                    </dd>
                  {/if}
                {/each}
              </dl>
            {/if}
          </section>
        {/each}
      </div>
    </div>
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
    width: min(600px, calc(100% - 24px));
    max-height: calc(100% - 48px);
    overflow: hidden;
  }
  dialog[open] {
    display: flex;
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
  @media (prefers-reduced-motion: reduce) {
    dialog[open] {
      animation-name: fadein;
    }
  }
  /* Mini's window is the bar: the panel fills it */
  dialog.bar {
    width: 100%;
    max-width: 100%;
    height: 100%;
    max-height: 100%;
    margin: 0;
    border-radius: 0;
    -webkit-app-region: no-drag;
  }
  .box {
    display: flex;
    flex-direction: column;
    min-height: 0;
    width: 100%;
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 12px 12px 20px;
    border-bottom: 1px solid var(--edge);
  }
  .names {
    flex: 1;
    min-width: 0;
  }
  h3 {
    margin: 0;
    font-size: var(--title-s);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub {
    margin: 2px 0 0;
    font-size: var(--text-s);
    color: var(--ink-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .close {
    flex: none;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 99px;
    color: var(--ink-2);
  }
  .close:hover {
    background: var(--hover);
    color: var(--ink);
  }
  .body {
    overflow-y: auto;
    padding: 4px 20px 20px;
    min-height: 0;
  }
  /* the ring would sit on the box's edge, cut by its corners */
  .body:focus-visible {
    outline-offset: -3px;
  }
  section {
    padding-top: 14px;
  }
  h4 {
    margin: 0 0 6px;
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .note {
    margin: 0 0 6px;
    font-size: var(--text-s);
    color: var(--ink-2);
  }
  dl {
    display: grid;
    grid-template-columns: minmax(96px, max-content) minmax(0, 1fr);
    gap: 5px 16px;
    margin: 0;
    font-size: var(--text-s);
  }
  dt {
    color: var(--ink-2);
    overflow-wrap: anywhere;
  }
  dd {
    margin: 0;
    min-width: 0;
  }
  .v {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    user-select: text;
  }
  .v.path {
    word-break: break-all;
  }
  .v.cut {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 6px;
    margin: 4px 0 2px;
  }
  .small {
    padding: 3px 10px;
    font-size: var(--text-xs);
  }
  .said {
    color: var(--ink-2);
  }
  .tagtype {
    grid-column: 1 / -1;
    margin-top: 6px;
    font-weight: 600;
    color: var(--ink);
  }
  .tagtype:first-child {
    margin-top: 0;
  }
  /* narrow: each value under its name */
  @media (max-width: 420px) {
    dl {
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
    }
    dd {
      margin-bottom: 6px;
    }
  }
</style>
